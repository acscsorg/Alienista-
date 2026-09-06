'use server';

import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';
import { Student } from '@/lib/types/models';
import { generateGoogleWalletSaveUrl, syncGoogleWalletObject } from '@/lib/badges/google-wallet';

export async function getStudentGoogleWalletUrlAction(studentId?: string): Promise<ActionResponse<{ url: string }>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  // Check if feature is enabled in environment
  if (process.env.NEXT_PUBLIC_ENABLE_GOOGLE_WALLET === 'false') {
    return { success: false, error: 'Google Wallet pass feature is disabled.' };
  }

  const { data: settings } = await admin
    .from('organization_settings')
    .select('google_wallet_enabled, google_wallet_design')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (settings && !settings.google_wallet_enabled && user.role !== 'admin') {
    return { success: false, error: 'Google Wallet pass generation is currently turned off by admin.' };
  }

  const targetId = user.role === 'admin' && studentId ? studentId : user.id;

  const { data: student, error } = await admin
    .from('students')
    .select('*')
    .eq('id', targetId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !student) return { success: false, error: 'Student record not found.' };

  const typedStudent = student as Student;
  const design = settings?.google_wallet_design === 'legacy' ? 'legacy' : 'builder';
  const sync = await syncGoogleWalletObject(typedStudent, design);
  const url = generateGoogleWalletSaveUrl(typedStudent, design);
  if (!url) return { success: false, error: 'Google Wallet server credentials not configured.' };

  return {
    success: true,
    data: { url },
    message: sync.status === 'failed' ? 'Wallet save link generated; existing pass refresh is temporarily unavailable.' : undefined,
  };
}
