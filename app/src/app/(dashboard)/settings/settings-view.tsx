'use client';

import React, { useState, useTransition } from 'react';
import { GoogleWalletDesign, Officer, OrganizationSettings, SanctionPolicy } from '@/lib/types/models';
import {
  addOfficerAction,
  resetOfficerPinAction,
  deleteOfficerAction,
  advanceSemesterAction,
  updateAdminCredentialsAction,
  toggleGoogleWalletAction,
  setGoogleWalletDesignAction,
} from '@/lib/actions/settings';
import { Settings, Shield, UserCheck, Plus, Trash2, KeyRound, ArrowRight, Save, AlertTriangle, Wallet } from 'lucide-react';
import { SanctionsPolicyEditor } from './sanctions-policy-editor';

export function SettingsView({
  initialSettings,
  initialOfficers,
  initialActivePolicy,
}: {
  initialSettings: OrganizationSettings;
  initialOfficers: Officer[];
  initialActivePolicy: SanctionPolicy | null;
}) {
  const [settings] = useState<OrganizationSettings>(initialSettings);
  const [officers, setOfficers] = useState<Officer[]>(initialOfficers);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // New Officer Form
  const [officerName, setOfficerName] = useState('');
  const [officerPin, setOfficerPin] = useState('');

  // Modals
  const [resetModalOfficer, setResetModalOfficer] = useState<Officer | null>(null);
  const [officerToDelete, setOfficerToDelete] = useState<Officer | null>(null);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [newPin, setNewPin] = useState('');

  // Admin Credentials Form
  const [currentAdminPassword, setCurrentAdminPassword] = useState('');
  const [newAdminUsername, setNewAdminUsername] = useState(settings.admin_username || 'admin');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  const [googleWalletEnabled, setGoogleWalletEnabled] = useState(Boolean(initialSettings.google_wallet_enabled));
  const [googleWalletDesign, setGoogleWalletDesign] = useState<GoogleWalletDesign>(initialSettings.google_wallet_design === 'legacy' ? 'legacy' : 'builder');

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleToggleGoogleWallet = () => {
    startTransition(async () => {
      const next = !googleWalletEnabled;
      setGoogleWalletEnabled(next);
      const res = await toggleGoogleWalletAction(next);
      if (!res.success) {
        setGoogleWalletEnabled(!next);
        showToast(res.error, 'err');
      } else {
        showToast(res.message || `Google Wallet passes ${next ? 'enabled' : 'disabled'}.`);
      }
    });
  };

  const handleWalletDesign = (design: GoogleWalletDesign) => {
    startTransition(async () => {
      const previous = googleWalletDesign;
      setGoogleWalletDesign(design);
      const res = await setGoogleWalletDesignAction(design);
      if (!res.success) {
        setGoogleWalletDesign(previous);
        showToast(res.error, 'err');
      } else {
        showToast(res.message || 'Google Wallet design updated.');
      }
    });
  };

  const handleUpdateAdminCreds = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAdminPassword) {
      showToast('Please enter your current admin password to apply changes.', 'err');
      return;
    }

    startTransition(async () => {
      const res = await updateAdminCredentialsAction({
        currentPassword: currentAdminPassword,
        newUsername: newAdminUsername,
        newPassword: newAdminPassword || undefined,
      });

      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }

      showToast('Admin credentials updated successfully!');
      setCurrentAdminPassword('');
      setNewAdminPassword('');
    });
  };

  const handleAddOfficer = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await addOfficerAction(officerName, officerPin);
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      setOfficers((prev) => [...prev, res.data]);
      showToast(`Officer ${officerName} added successfully!`);
      setOfficerName('');
      setOfficerPin('');
    });
  };

  const handleResetPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalOfficer) return;
    startTransition(async () => {
      const res = await resetOfficerPinAction(resetModalOfficer.id, newPin);
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      showToast(`PIN for ${resetModalOfficer.name} updated!`);
      setResetModalOfficer(null);
      setNewPin('');
    });
  };

  const handleConfirmDeleteOfficer = () => {
    if (!officerToDelete) return;
    startTransition(async () => {
      const res = await deleteOfficerAction(officerToDelete.id);
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      setOfficers((prev) => prev.filter((item) => item.id !== officerToDelete.id));
      showToast(`Officer ${officerToDelete.name} removed.`);
      setOfficerToDelete(null);
    });
  };

  const handleConfirmAdvanceSemester = () => {
    startTransition(async () => {
      const res = await advanceSemesterAction();
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      showToast(res.data.message);
      setShowAdvanceModal(false);
      window.location.reload();
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {toast && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-bold border ${
            toast.type === 'ok'
              ? 'bg-[#EBF5EE] border-[#C2E0CC] text-[#1B4332]'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Admin Credentials & Master Login Card */}
      <div className="p-6 bg-white border border-[#E5EBE5] rounded-3xl shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#2D6A4F]" />
          <span>Admin Master Credentials</span>
        </h3>
        <p className="text-xs text-slate-500">
          Configure the shared executive board sign-in credentials.
        </p>

        <form onSubmit={handleUpdateAdminCreds} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Username</label>
              <input
                type="text"
                required
                value={newAdminUsername}
                onChange={(e) => setNewAdminUsername(e.target.value)}
                placeholder="admin"
                className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Password (leave blank to keep current)</label>
              <input
                type="password"
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                placeholder="New password (min 6 chars)"
                className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#2D6A4F] mb-1">Current Password (required to save changes)</label>
            <input
              type="password"
              required
              value={currentAdminPassword}
              onChange={(e) => setCurrentAdminPassword(e.target.value)}
              placeholder="Current admin password"
              className="w-full bg-[#F8FAF9] border border-[#C2E0CC] rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#2D6A4F]"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Update Credentials</span>
            </button>
          </div>
        </form>
      </div>

      {/* Current Term Card */}
      <div className="p-6 bg-white border border-[#E5EBE5] rounded-3xl shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#2D6A4F]" />
          <span>Academic Term Management</span>
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-[#F8FAF9] border border-[#E5EBE5] rounded-2xl">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
              Current Semester
            </span>
            <span className="text-lg font-extrabold text-[#1B4332]">{settings.semester}</span>
          </div>
          <div className="p-4 bg-[#F8FAF9] border border-[#E5EBE5] rounded-2xl">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
              Academic Year
            </span>
            <span className="text-lg font-extrabold text-[#1B4332]">{settings.academic_year}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#EBF5EE] border border-[#C2E0CC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-700 leading-relaxed font-medium">
            {settings.semester === 'First Semester' ? (
              <span>Move term forward to <b>Second Semester</b> (maintains student year levels).</span>
            ) : (
              <span>Start <b>First Semester</b> of next academic year and <b>promote all active students one year level</b>.</span>
            )}
          </div>
          <button
            onClick={() => setShowAdvanceModal(true)}
            disabled={isPending}
            className="px-4 py-2 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shrink-0 transition-colors shadow-xs"
          >
            <span>Advance Term</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <SanctionsPolicyEditor
        initialEnabled={Boolean(settings.sanctions_enabled)}
        initialPolicy={initialActivePolicy}
      />

      {/* Google Wallet Passes Card */}
      <div className="p-6 bg-white border border-[#E5EBE5] rounded-3xl shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[#2D6A4F]" />
              <span>Google Wallet Passes</span>
            </h3>
            <p className="text-xs text-slate-500">
              Allow students to save their membership badge directly into Google Wallet.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={googleWalletEnabled}
            onClick={handleToggleGoogleWallet}
            disabled={isPending}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              googleWalletEnabled ? 'bg-[#2D6A4F]' : 'bg-slate-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                googleWalletEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-[#F8FAF9] border border-[#E5EBE5] text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-800">How it works:</p>
          <ul className="list-disc list-inside space-y-0.5 text-slate-500">
            <li>When enabled, students will see a &quot;Save to Google Wallet&quot; button on their badge page.</li>
            <li>Passes display student details and a scannable QR code compatible with officer attendance cameras.</li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5EBE5] pt-4">
          <div>
            <p className="font-semibold text-slate-800">Wallet design experiment</p>
            <p className="text-[11px] text-slate-500">Organization-wide and reversible. New saves and refreshes use this choice.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => handleWalletDesign('builder')} disabled={isPending || googleWalletDesign === 'builder'} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${googleWalletDesign === 'builder' ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white text-slate-600 border-[#E5EBE5]'}`}>Pass Builder</button>
            <button type="button" onClick={() => handleWalletDesign('legacy')} disabled={isPending || googleWalletDesign === 'legacy'} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${googleWalletDesign === 'legacy' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-[#E5EBE5]'}`}>Revert</button>
          </div>
        </div>
      </div>

      {/* Officer Roster & Access Control */}
      <div className="p-6 bg-white border border-[#E5EBE5] rounded-3xl shadow-xs space-y-5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-[#2D6A4F]" />
          <span>Officer Roster & Access Control</span>
        </h3>

        {/* Add Officer Inline Form */}
        <form onSubmit={handleAddOfficer} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            required
            placeholder="Officer Full Name"
            value={officerName}
            onChange={(e) => setOfficerName(e.target.value)}
            className="flex-1 bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F]"
          />
          <input
            type="password"
            required
            placeholder="PIN (min 4 digits)"
            value={officerPin}
            onChange={(e) => setOfficerPin(e.target.value)}
            className="w-full sm:w-40 bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F]"
          />
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Officer</span>
          </button>
        </form>

        {/* Officers Table */}
        <div className="border border-[#E5EBE5] rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAF9] text-slate-600">
              <tr>
                <th className="py-2.5 px-4 font-bold uppercase text-[10px]">Officer Name</th>
                <th className="py-2.5 px-4 font-bold uppercase text-[10px]">Status</th>
                <th className="py-2.5 px-4 font-bold uppercase text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EBE5] text-slate-700">
              {officers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted-foreground">
                    No officer accounts created yet.
                  </td>
                </tr>
              ) : (
                officers.map((o) => (
                  <tr key={o.id} className="hover:bg-[#F8FAF9]">
                    <td className="py-3 px-4 font-bold text-slate-900">{o.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF5EE] text-[#1B4332] border border-[#C2E0CC]">
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setResetModalOfficer(o);
                            setNewPin('');
                          }}
                          className="text-[11px] text-[#2D6A4F] font-bold hover:underline flex items-center gap-1"
                        >
                          <KeyRound className="w-3 h-3" /> Reset PIN
                        </button>
                        <button
                          onClick={() => setOfficerToDelete(o)}
                          className="text-[11px] text-red-600 font-bold hover:underline flex items-center gap-1 ml-2"
                        >
                          <Trash2 className="w-3 h-3" /> Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advance Term Confirmation Modal */}
      {showAdvanceModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5EBE5] rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-[#1B4332] font-bold text-base">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>Confirm Academic Term Advancement</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {settings.semester === 'First Semester'
                ? 'Advance to Second Semester of the current Academic Year? Student year levels will remain unchanged, and historical logs will be preserved.'
                : 'Start the next Academic Year (First Semester)? All active students will advance one year level (1st → 2nd → 3rd → 4th).'}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanceModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-800 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmAdvanceSemester}
                className="px-4 py-2 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold text-xs rounded-xl transition-colors shadow-xs"
              >
                {isPending ? 'Advancing...' : 'Confirm Advance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Officer Modal */}
      {officerToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5EBE5] rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-red-600 font-bold text-base">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span>Remove Officer Account?</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove <b>{officerToDelete.name}</b>? They will no longer be able to sign in for scanning duty.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOfficerToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-800 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmDeleteOfficer}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors shadow-xs"
              >
                {isPending ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset PIN Modal */}
      {resetModalOfficer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5EBE5] rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Reset Officer PIN: {resetModalOfficer.name}</h3>
            <form onSubmit={handleResetPinSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New PIN (min 4 digits)</label>
                <input
                  type="password"
                  required
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalOfficer(null)}
                  className="px-3.5 py-1.5 rounded-xl text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-3.5 py-1.5 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold rounded-xl text-xs"
                >
                  Save New PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
