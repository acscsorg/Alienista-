import React from 'react';
import { getSessionUser } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { BadgeCard } from '@/components/badges/badge-card';
import { Student } from '@/lib/types/models';
import { redirect } from 'next/navigation';

export default async function MyQrPage() {
  const user = await getSessionUser();
  if (!user || user.role !== 'student') redirect('/login');

  const admin = createAdminClient();
  const [{ data: student }, { data: settings }] = await Promise.all([
    admin
      .from('students')
      .select('*')
      .eq('id', user.id)
      .maybeSingle(),
    admin
      .from('organization_settings')
      .select('google_wallet_enabled')
      .eq('organization_id', user.organization_id)
      .maybeSingle(),
  ]);

  if (!student) {
    return (
      <div className="p-8 bg-white border border-[#E5EBE5] rounded-3xl text-center text-xs text-slate-500 shadow-xs">
        Student record not found. Please contact an officer or administrator.
      </div>
    );
  }

  const isWalletEnabled =
    process.env.NEXT_PUBLIC_ENABLE_GOOGLE_WALLET !== 'false' &&
    Boolean(settings?.google_wallet_enabled);

  return (
    <div className="space-y-6 text-center">
      <div>
        <h1 className="text-xl font-extrabold text-[#1B4332] tracking-tight">My Membership Badge</h1>
        <p className="text-xs text-slate-500 mt-1">Present this QR code to the officer during event attendance.</p>
      </div>

      <BadgeCard
        student={student as Student}
        showWalletButton={isWalletEnabled}
      />
    </div>
  );
}
