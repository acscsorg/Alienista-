'use server';

import bcrypt from 'bcryptjs';
import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse, PageRequest, PaginatedResult } from '@/lib/types/actions';
import { BadgeStudent, MemberStatus, ScannerStudent, Student, YearLevel } from '@/lib/types/models';
import { studentSchema } from '@/lib/validations/students';
import { revalidatePath } from 'next/cache';
import { allocateStudentUid } from '@/lib/students/uid';
import { withServerTiming } from '@/lib/server-timing';
import { normalizePageRequest, pageRange } from '@/lib/pagination';
import { syncGoogleWalletObject } from '@/lib/badges/google-wallet';
import type { GoogleWalletDesign } from '@/lib/types/models';

const STUDENT_PROJECTION = 'id, organization_id, uid, student_number, first_name, last_name, full_name, course, year, section, status, is_first_login, avatar_url, created_at, updated_at';

async function getWalletDesign(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<GoogleWalletDesign> {
  const { data } = await admin.from('organization_settings').select('google_wallet_design').eq('organization_id', orgId).maybeSingle();
  return data?.google_wallet_design === 'legacy' ? 'legacy' : 'builder';
}

const SCANNER_PROJECTION = 'id, organization_id, uid, student_number, full_name, status, avatar_url';
const BADGE_PROJECTION = 'id, uid, student_number, full_name, course, year, section, status, avatar_url';

export async function getStudentsAction(
  input?: Partial<PageRequest>
): Promise<ActionResponse<PaginatedResult<Student>>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const request = normalizePageRequest(input, 10);
  const { from, to } = pageRange(request.page, request.pageSize);
  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  let query = admin
    .from('students')
    .select(STUDENT_PROJECTION, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('full_name', { ascending: true });

  if (request.query) {
    const search = `%${request.query}%`;
    query = query.or(`full_name.ilike.${search},uid.ilike.${search},student_number.ilike.${search}`);
  }
  if (request.year) query = query.eq('year', request.year);
  if (request.status) query = query.eq('status', request.status);

  const { data, error, count } = await withServerTiming('students', async () => query.range(from, to));

  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: {
      items: (data || []) as Student[],
      total: count || 0,
      page: request.page,
      pageSize: request.pageSize,
    },
  };
}

export async function getScannerStudentsAction(): Promise<ActionResponse<ScannerStudent[]>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data, error } = await admin.from('students').select(SCANNER_PROJECTION).eq('organization_id', orgId).eq('status', 'Active').order('full_name', { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data || []) as ScannerStudent[] };
}

export async function getBadgeStudentsAction(
  input?: Partial<PageRequest>
): Promise<ActionResponse<PaginatedResult<BadgeStudent>>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const request = normalizePageRequest(input, 8);
  const { from, to } = pageRange(request.page, request.pageSize);
  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  let query = admin
    .from('students')
    .select(BADGE_PROJECTION, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('full_name', { ascending: true });
  if (request.query) {
    const search = `%${request.query}%`;
    query = query.or(`full_name.ilike.${search},uid.ilike.${search},student_number.ilike.${search}`);
  }
  if (request.year) query = query.eq('year', request.year);
  if (request.status) query = query.eq('status', request.status);
  const { data, error, count } = await query.range(from, to);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: {
      items: (data || []) as BadgeStudent[],
      total: count || 0,
      page: request.page,
      pageSize: request.pageSize,
    },
  };
}

export async function createStudentAction(rawInput: unknown): Promise<ActionResponse<Student>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Only admins can add students.' };

  const parsed = studentSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  let finalUid = parsed.data.uid?.trim();
  if (!finalUid) {
    finalUid = await allocateStudentUid(orgId);
  }

  const firstName = parsed.data.first_name.trim();
  const lastName = parsed.data.last_name.trim();
  const computedFullName = `${firstName} ${lastName}`;
  const defaultPass = lastName.toUpperCase();
  const passHash = await bcrypt.hash(defaultPass, 10);

  const { data, error } = await admin
    .from('students')
    .insert({
      organization_id: orgId,
      uid: finalUid,
      student_number: parsed.data.student_number.trim(),
      first_name: firstName,
      last_name: lastName,
      full_name: computedFullName,
      course: parsed.data.course,
      year: parsed.data.year,
      section: parsed.data.section.trim(),
      status: parsed.data.status,
      avatar_url: parsed.data.avatar_url || null,
      password_hash: passHash,
      is_first_login: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A student with this UID or Student Number already exists.' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/students');
  return { success: true, data: data as Student };
}

export async function updateStudentAction(id: string, rawInput: unknown): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const parsed = studentSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  const firstName = parsed.data.first_name.trim();
  const lastName = parsed.data.last_name.trim();
  const computedFullName = `${firstName} ${lastName}`;

  const updatePayload: Record<string, unknown> = {
    student_number: parsed.data.student_number.trim(),
    first_name: firstName,
    last_name: lastName,
    full_name: computedFullName,
    course: parsed.data.course,
    year: parsed.data.year,
    section: parsed.data.section.trim(),
    status: parsed.data.status,
  };

  const { data: updatedStudent, error } = await admin
    .from('students')
    .update(updatePayload)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select(STUDENT_PROJECTION)
    .single();

  if (error) return { success: false, error: error.message };
  const walletSync = await syncGoogleWalletObject(updatedStudent as Student, await getWalletDesign(admin, orgId));
  if (walletSync.status === 'failed') console.warn('Google Wallet profile sync failed:', walletSync.error);
  revalidatePath('/students');
  revalidatePath('/my-qr');
  return { success: true, data: undefined };
}

function avatarStoragePath(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  const marker = '/storage/v1/object/public/student-avatars/';
  const markerIndex = publicUrl.indexOf(marker);
  return markerIndex === -1 ? null : decodeURIComponent(publicUrl.slice(markerIndex + marker.length));
}

function validateAvatarFile(formData: FormData): { file: File } | { error: string } {
  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'No image file provided.' };
  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) return { error: 'Image size exceeds the 2MB limit. Please upload a smaller image.' };
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type.toLowerCase())) {
    return { error: 'Invalid file format. Only JPG, PNG, and WebP images are allowed (no GIFs).' };
  }
  return { file };
}

export async function replaceStudentAvatarAction(
  studentId: string,
  formData: FormData
): Promise<ActionResponse<{ publicUrl: string }>> {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') return { success: false, error: 'Only admins can replace student photos.' };
    const validated = validateAvatarFile(formData);
    if ('error' in validated) return { success: false, error: validated.error };
    const { file } = validated;

    const orgId = await getEffectiveOrgId(user.organization_id);
    const admin = createAdminClient();
    const { data: student, error: studentError } = await admin
      .from('students')
      .select('id, avatar_url')
      .eq('id', studentId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (studentError) return { success: false, error: studentError.message };
    if (!student) return { success: false, error: 'Student not found in this organization.' };

    const extension = file.type.toLowerCase() === 'image/webp'
      ? 'webp'
      : file.type.toLowerCase() === 'image/png' ? 'png' : 'jpg';
    const filePath = `${orgId}/${studentId}/avatar-${Date.now()}.${extension}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from('student-avatars')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) return { success: false, error: `Failed to upload image: ${uploadError.message}` };

    const { data: { publicUrl } } = admin.storage
      .from('student-avatars')
      .getPublicUrl(filePath);

    const { data: updated, error: updateError } = await admin
      .from('students')
      .update({ avatar_url: publicUrl })
      .eq('id', studentId)
      .eq('organization_id', orgId)
      .select(STUDENT_PROJECTION)
      .maybeSingle();
    if (updateError || !updated) {
      await admin.storage.from('student-avatars').remove([filePath]);
      return { success: false, error: updateError?.message || 'Student photo could not be updated.' };
    }

    const previousPath = avatarStoragePath(student.avatar_url);
    if (previousPath && previousPath !== filePath) {
      await admin.storage.from('student-avatars').remove([previousPath]);
    }

    const walletSync = await syncGoogleWalletObject(updated as Student, await getWalletDesign(admin, orgId));
    if (walletSync.status === 'failed') console.warn('Google Wallet avatar sync failed:', walletSync.error);
    revalidatePath('/students');
    revalidatePath('/qr-generator');
    revalidatePath('/my-qr');
    return { success: true, data: { publicUrl } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to upload student photo.' };
  }
}

export async function removeStudentAvatarAction(studentId: string): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Only admins can remove student photos.' };
  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data: student, error: readError } = await admin.from('students').select('id, avatar_url')
    .eq('id', studentId).eq('organization_id', orgId).maybeSingle();
  if (readError) return { success: false, error: readError.message };
  if (!student) return { success: false, error: 'Student not found in this organization.' };
  const { data: updated, error } = await admin.from('students').update({ avatar_url: null })
    .eq('id', studentId).eq('organization_id', orgId)
    .select(STUDENT_PROJECTION)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  const previousPath = avatarStoragePath(student.avatar_url);
  if (previousPath) await admin.storage.from('student-avatars').remove([previousPath]);
  const walletSync = await syncGoogleWalletObject(updated as Student, await getWalletDesign(admin, orgId));
  if (walletSync.status === 'failed') console.warn('Google Wallet avatar removal sync failed:', walletSync.error);
  revalidatePath('/students');
  revalidatePath('/qr-generator');
  revalidatePath('/my-qr');
  return { success: true, data: undefined };
}

export async function deleteStudentAction(id: string): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { error } = await admin
    .from('students')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/students');
  return { success: true, data: undefined };
}

export async function resetStudentPasswordAction(id: string): Promise<ActionResponse<string>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data: student } = await admin
    .from('students')
    .select('id, full_name, last_name, first_name')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single();

  if (!student) return { success: false, error: 'Student not found.' };

  const defaultPass = (student.last_name || student.full_name.trim().split(' ').pop() || 'STUDENT').trim().toUpperCase();
  const passHash = await bcrypt.hash(defaultPass, 10);

  const { error } = await admin
    .from('students')
    .update({
      password_hash: passHash,
      is_first_login: true,
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  return { success: true, data: defaultPass, message: `Password reset to default (${defaultPass})` };
}

export async function bulkImportStudentsCsvAction(
  csvRows: Array<{
    uid?: string;
    student_number: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    course?: string;
    year: YearLevel;
    section: string;
    status?: MemberStatus;
  }>
): Promise<ActionResponse<{ imported: number; failed: number; errors: string[] }>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of csvRows) {
    let firstName = (row.first_name || '').trim();
    let lastName = (row.last_name || '').trim();
    let fullName = (row.full_name || '').trim();

    if (!firstName || !lastName) {
      if (fullName) {
        const parts = fullName.split(' ');
        lastName = parts.pop() || 'STUDENT';
        firstName = parts.join(' ') || lastName;
      } else {
        firstName = 'Student';
        lastName = 'Member';
        fullName = 'Student Member';
      }
    } else {
      fullName = `${firstName} ${lastName}`;
    }

    const defaultPass = lastName.toUpperCase();
    const passHash = await bcrypt.hash(defaultPass, 10);

    let uid = (row.uid || '').trim();
    if (!uid) {
      try {
        uid = await allocateStudentUid(orgId);
      } catch {
        failed++;
        errors.push(`Row ${row.student_number} (${fullName}): Failed to allocate a unique student UID.`);
        continue;
      }
    }

    const { error } = await admin.from('students').insert({
      organization_id: orgId,
      uid,
      student_number: row.student_number.trim(),
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      course: row.course || 'BS Computer Science',
      year: row.year || '1st Year',
      section: row.section.trim(),
      status: row.status || 'Active',
      password_hash: passHash,
      is_first_login: true,
    });

    if (error) {
      failed++;
      errors.push(`Row ${row.student_number} (${fullName}): ${error.message}`);
    } else {
      imported++;
    }
  }

  revalidatePath('/students');
  return { success: true, data: { imported, failed, errors } };
}
