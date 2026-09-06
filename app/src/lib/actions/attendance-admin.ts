'use server';

import { requireRole } from '@/lib/auth/guards';
import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import type { ActionResponse, AttendanceCorrectionInput } from '@/lib/types/actions';
import type { AttendanceRecord, StudentAttendanceDetails } from '@/lib/types/models';
import { revalidatePath } from 'next/cache';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function correctionInputError(input: AttendanceCorrectionInput | undefined): string | null {
  if (!input) return 'Attendance correction input is required.';
  if (!UUID_PATTERN.test(input.record_id) || (input.slot_id !== null && !UUID_PATTERN.test(input.slot_id))) {
    return 'Invalid attendance record or slot identifier.';
  }
  if (!input.reason.trim()) return 'A correction reason is required.';
  if (!Number.isFinite(new Date(input.effective_scan_time).getTime())) return 'Enter a valid effective scan time.';
  if (!['on_time', 'late', 'manual'].includes(input.attendance_status)) return 'Select a valid attendance status.';
  if (!Number.isFinite(input.late_penalty_percent) || input.late_penalty_percent < 0 || input.late_penalty_percent > 100) {
    return 'Late penalty must be between 0 and 100.';
  }
  if (input.earned_points_override !== null && (!Number.isFinite(input.earned_points_override) || input.earned_points_override < 0)) {
    return 'Awarded points cannot be negative.';
  }
  return null;
}

function revalidateAttendanceViews() {
  revalidatePath('/students');
  revalidatePath('/statistics');
  revalidatePath('/assessments');
}

export async function getStudentAttendanceDetailsAction(
  studentId: string
): Promise<ActionResponse<StudentAttendanceDetails>> {
  let user;
  try {
    user = await requireRole('admin');
  } catch {
    return { success: false, error: 'Only admins can view attendance correction details.' };
  }
  if (!studentId.trim()) return { success: false, error: 'Student identifier is required.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data: student, error: studentError } = await admin
    .from('students')
    .select('id, full_name, student_number')
    .eq('id', studentId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (studentError) return { success: false, error: studentError.message };
  if (!student) return { success: false, error: 'Student not found in this organization.' };

  const [recordsResult, correctionsResult] = await Promise.all([
    admin
      .from('attendance_records')
      .select('*, event:events(id, name, weight, term_key, slots:event_slots(*)), slot:event_slots(id, label, is_required)')
      .eq('organization_id', orgId)
      .eq('student_id', studentId)
      .order('effective_scan_time', { ascending: false }),
    admin
      .from('attendance_record_corrections')
      .select('*')
      .eq('organization_id', orgId)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false }),
  ]);

  if (recordsResult.error) return { success: false, error: recordsResult.error.message };
  if (correctionsResult.error) return { success: false, error: correctionsResult.error.message };
  return {
    success: true,
    data: {
      student: student as StudentAttendanceDetails['student'],
      records: (recordsResult.data || []) as StudentAttendanceDetails['records'],
      corrections: (correctionsResult.data || []) as StudentAttendanceDetails['corrections'],
    },
  };
}

export async function updateAttendanceRecordAction(
  input: AttendanceCorrectionInput
): Promise<ActionResponse<AttendanceRecord>> {
  let user;
  try {
    user = await requireRole('admin');
  } catch {
    return { success: false, error: 'Only admins can modify attendance records.' };
  }

  const validationError = correctionInputError(input);
  if (validationError) return { success: false, error: validationError };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('update_attendance_record', {
    p_record_id: input.record_id,
    p_organization_id: orgId,
    p_corrected_by: user.id,
    p_slot_id: input.slot_id,
    p_effective_scan_time: new Date(input.effective_scan_time).toISOString(),
    p_attendance_status: input.attendance_status,
    p_late_penalty_percent: input.late_penalty_percent,
    p_earned_points_override: input.earned_points_override,
    p_reason: input.reason.trim(),
  });

  if (error || !data) return { success: false, error: error?.message || 'Failed to update attendance record.' };
  revalidateAttendanceViews();
  return { success: true, data: data as AttendanceRecord, message: 'Attendance record updated and audited.' };
}

export async function deleteAttendanceRecordAction(input: {
  record_id: string;
  reason: string;
} | undefined): Promise<ActionResponse> {
  let user;
  try {
    user = await requireRole('admin');
  } catch {
    return { success: false, error: 'Only admins can delete attendance records.' };
  }

  if (!input) return { success: false, error: 'Attendance deletion input is required.' };
  if (!UUID_PATTERN.test(input.record_id)) return { success: false, error: 'Invalid attendance record identifier.' };
  if (!input.reason.trim()) return { success: false, error: 'A correction reason is required.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { error } = await admin.rpc('delete_attendance_record', {
    p_record_id: input.record_id,
    p_organization_id: orgId,
    p_corrected_by: user.id,
    p_reason: input.reason.trim(),
  });

  if (error) return { success: false, error: error.message };
  revalidateAttendanceViews();
  return { success: true, data: undefined, message: 'Attendance record deleted and audited.' };
}
