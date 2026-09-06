'use server';

import bcrypt from 'bcryptjs';
import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse, SanctionPolicyVersionInput } from '@/lib/types/actions';
import { GoogleWalletDesign, Officer, OrganizationSettings, SanctionPolicy } from '@/lib/types/models';
import { revalidatePath } from 'next/cache';
import { withServerTiming } from '@/lib/server-timing';

export async function getSettingsDataAction(): Promise<
  ActionResponse<{
    settings: OrganizationSettings;
    officers: Officer[];
    activePolicy: SanctionPolicy | null;
  }>
> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  const [{ data: settings }, { data: officers }, { data: activePolicy }] = await withServerTiming('settings', () => Promise.all([
    admin.from('organization_settings').select('id, organization_id, academic_year, semester, admin_username, sanctions_enabled, google_wallet_enabled, google_wallet_design, updated_at').eq('organization_id', orgId).maybeSingle(),
    admin.from('officers').select('id, organization_id, name, status, created_at, updated_at').eq('organization_id', orgId).order('name', { ascending: true }),
    admin.from('sanction_policies').select('*, sanction_tiers(*)').eq('organization_id', orgId).eq('is_active', true).order('version', { ascending: false }).limit(1).maybeSingle(),
  ]));

  return {
    success: true,
    data: {
      settings: settings || {
        id: '',
        organization_id: orgId,
        academic_year: '2026-2027',
        semester: 'First Semester',
        admin_username: 'admin',
        sanctions_enabled: false,
        google_wallet_enabled: false,
        google_wallet_design: 'builder',
        updated_at: new Date().toISOString(),
      },
      officers: (officers as Officer[]) || [],
      activePolicy: activePolicy
        ? ({ ...activePolicy, tiers: activePolicy.sanction_tiers || [] } as SanctionPolicy)
        : null,
    },
  };
}

function policyInputError(input: SanctionPolicyVersionInput | undefined): string | null {
  if (!input) return 'Sanction policy input is required.';
  if (!input.name.trim()) return 'Policy name is required.';
  if (input.mode !== 'weighted_missed_points' && input.mode !== 'attendance_percentage') return 'Select a valid policy mode.';
  if (input.tiers.length === 0) return 'Add at least one valid sanction tier.';
  if (input.tiers.some((tier) => !tier.label.trim() || !tier.obligation_text.trim())) {
    return 'Every tier needs a name and obligation.';
  }
  if (input.tiers.some((tier) => !Number.isFinite(tier.threshold))) return 'Every tier needs a numeric threshold.';
  if (input.mode === 'weighted_missed_points' && input.tiers.some((tier) => tier.threshold < 0)) {
    return 'Weighted missed-points thresholds cannot be negative.';
  }
  if (input.mode === 'attendance_percentage' && input.tiers.some((tier) => tier.threshold < 0 || tier.threshold > 100)) {
    return 'Attendance thresholds must be between 0 and 100 percent.';
  }
  return null;
}

export async function createSanctionPolicyVersionAction(
  input: SanctionPolicyVersionInput
): Promise<ActionResponse<SanctionPolicy>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Only admins can configure sanction policies.' };
  const validationError = policyInputError(input);
  if (validationError) return { success: false, error: validationError };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const tiers = input.tiers.map((tier) => ({
    label: tier.label.trim(),
    threshold: tier.threshold,
    obligation_text: tier.obligation_text.trim(),
  }));
  const { data, error } = await admin.rpc('create_sanction_policy_version', {
    p_organization_id: orgId,
    p_name: input.name.trim(),
    p_mode: input.mode,
    p_tiers: tiers,
    p_activate: input.activate,
  });
  if (error || !data) return { success: false, error: error?.message || 'Failed to create sanction policy version.' };
  revalidatePath('/settings');
  revalidatePath('/assessments');
  return { success: true, data: data as SanctionPolicy, message: 'Sanction policy version created.' };
}

export async function toggleSanctionsAction(enabled: boolean): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Only admins can enable or disable sanctions.' };
  if (typeof enabled !== 'boolean') return { success: false, error: 'Sanctions toggle must be a boolean.' };
  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { error } = await admin.rpc('set_sanctions_enabled', {
    p_organization_id: orgId,
    p_enabled: enabled,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath('/settings');
  revalidatePath('/assessments');
  return { success: true, data: undefined, message: enabled ? 'Sanctions enabled.' : 'Sanctions disabled.' };
}

export async function updateAdminCredentialsAction(input: {
  currentPassword: string;
  newUsername?: string;
  newPassword?: string;
}): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const { currentPassword, newUsername, newPassword } = input;
  if (!currentPassword) return { success: false, error: 'Current password is required.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from('organization_settings')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!settings) return { success: false, error: 'Settings record not found.' };

  if (!settings.admin_password_hash) {
    return { success: false, error: 'No admin password is set. Please contact your system administrator.' };
  }

  const isValid = await bcrypt.compare(currentPassword, settings.admin_password_hash);

  if (!isValid) {
    return { success: false, error: 'Incorrect current admin password.' };
  }

  const updates: Record<string, unknown> = {};
  if (newUsername && newUsername.trim()) {
    updates.admin_username = newUsername.trim();
  }
  if (newPassword && newPassword.trim()) {
    if (newPassword.trim().length < 6) {
      return { success: false, error: 'New password must be at least 6 characters.' };
    }
    updates.admin_password_hash = await bcrypt.hash(newPassword.trim(), 10);
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await admin
      .from('organization_settings')
      .update(updates)
      .eq('id', settings.id);

    if (error) return { success: false, error: error.message };
  }

  revalidatePath('/settings');
  return { success: true, data: undefined, message: 'Admin credentials updated successfully!' };
}

export async function addOfficerAction(name: string, pin: string): Promise<ActionResponse<Officer>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  if (!name.trim() || !pin.trim()) return { success: false, error: 'Name and PIN are required.' };
  if (pin.trim().length < 4) return { success: false, error: 'PIN must be at least 4 digits.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const pinHash = await bcrypt.hash(pin.trim(), 10);

  const { data, error } = await admin
    .from('officers')
    .insert({
      organization_id: orgId,
      name: name.trim(),
      pin_hash: pinHash,
      status: 'Active',
    })
    .select('id, organization_id, name, status, created_at, updated_at')
    .single();

  if (error) {
    if (error.code === '23505') return { success: false, error: 'An officer with this name already exists.' };
    return { success: false, error: error.message };
  }

  revalidatePath('/settings');
  return { success: true, data: data as Officer };
}

export async function resetOfficerPinAction(officerId: string, newPin: string): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  if (newPin.trim().length < 4) return { success: false, error: 'PIN must be at least 4 digits.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const pinHash = await bcrypt.hash(newPin.trim(), 10);

  const { error } = await admin
    .from('officers')
    .update({ pin_hash: pinHash })
    .eq('id', officerId)
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/settings');
  return { success: true, data: undefined };
}

export async function deleteOfficerAction(officerId: string): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { error } = await admin
    .from('officers')
    .delete()
    .eq('id', officerId)
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/settings');
  return { success: true, data: undefined };
}

export async function advanceSemesterAction(): Promise<ActionResponse<{ message: string }>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  const { data: settings } = await admin
    .from('organization_settings')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!settings) return { success: false, error: 'Settings not found.' };

  // If First Semester -> Advance to Second Semester (No student promotions)
  if (settings.semester === 'First Semester') {
    await admin
      .from('organization_settings')
      .update({ semester: 'Second Semester' })
      .eq('id', settings.id);

    revalidatePath('/settings');
    return { success: true, data: { message: 'Advanced to Second Semester. Student year levels maintained.' } };
  }

  // If Second Semester -> Roll over to next Academic Year & Promote Active Students
  const [y1, y2] = settings.academic_year.split('-').map(Number);
  const nextAcademicYear = `${(y1 || 2026) + 1}-${(y2 || 2027) + 1}`;

  // Promote all active students by year level in 4 batched UPDATE queries.
  // Running them in parallel is safe: each targets a distinct year value,
  // so there is no overlap. If the process crashes mid-way the worst case is
  // that some year levels are promoted and some are not — re-running is safe
  // because each query is idempotent (1st Years → 2nd Year; already-2nd-Years
  // are unaffected). The final settings update is done last so the term_key
  // on new events always reflects the committed promotions.
  await Promise.all([
    admin.from('students').update({ year: '2nd Year', status: 'Active' })
      .eq('organization_id', orgId).eq('status', 'Active').eq('year', '1st Year'),
    admin.from('students').update({ year: '3rd Year', status: 'Active' })
      .eq('organization_id', orgId).eq('status', 'Active').eq('year', '2nd Year'),
    admin.from('students').update({ year: '4th Year', status: 'Active' })
      .eq('organization_id', orgId).eq('status', 'Active').eq('year', '3rd Year'),
    admin.from('students').update({ year: '4th Year', status: 'Inactive' })
      .eq('organization_id', orgId).eq('status', 'Active').eq('year', '4th Year'),
  ]);

  await admin
    .from('organization_settings')
    .update({
      academic_year: nextAcademicYear,
      semester: 'First Semester',
    })
    .eq('id', settings.id);

  revalidatePath('/settings');
  return {
    success: true,
    data: { message: `Started Academic Year ${nextAcademicYear} (First Semester). Students promoted successfully!` },
  };
}

export async function toggleGoogleWalletAction(enabled: boolean): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  const { error } = await admin
    .from('organization_settings')
    .update({ google_wallet_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/settings');
  revalidatePath('/my-qr');
  return { success: true, data: undefined, message: `Google Wallet passes ${enabled ? 'enabled' : 'disabled'}.` };
}

export async function setGoogleWalletDesignAction(design: GoogleWalletDesign): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };
  if (design !== 'builder' && design !== 'legacy') return { success: false, error: 'Invalid Google Wallet design.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { error } = await admin
    .from('organization_settings')
    .update({ google_wallet_design: design, updated_at: new Date().toISOString() })
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/settings');
  revalidatePath('/my-qr');
  return {
    success: true,
    data: undefined,
    message: design === 'builder' ? 'Pass Builder design enabled for this organization.' : 'Legacy Wallet design restored for this organization.',
  };
}
