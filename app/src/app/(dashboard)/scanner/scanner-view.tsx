'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Event, ScannerStudent } from '@/lib/types/models';
import { recordScanAction } from '@/lib/actions/attendance';
import { QrScannerComponent } from '@/components/scanner/qr-scanner';
import { ManualOverrideDialog } from '@/components/scanner/manual-override-dialog';
import { playBeep } from '@/components/scanner/audio';
import { offlineDB } from '@/lib/offline-db';
import { buildOfflineScope, reconcileSyncResults, type PendingScan } from '@/lib/offline-sync';
import { useAutoSync } from '@/hooks/use-auto-sync';
import {
  Camera,
  SwitchCamera,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Send,
  UserCheck,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface ScannerViewProps {
  events: Event[];
  students: ScannerStudent[];
  userRole: string;
  officerName: string;
  officerId: string;
  organizationId: string;
}

interface ScanFeedback {
  status: 'present' | 'dup' | 'offline_queued' | 'invalid';
  name?: string;
  uid?: string;
  avatar_url?: string | null;
  detail?: string;
}

export function ScannerView({ events, students, userRole, officerName, officerId, organizationId }: ScannerViewProps) {
  const openEvents = events.filter((e) => e.status === 'Open');
  const [selectedEventId, setSelectedEventId] = useState<string>(openEvents[0]?.id || '');
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [lastScan, setLastScan] = useState<ScanFeedback | null>(null);
  const [recentScans, setRecentScans] = useState<Array<{ name: string; status: string; time: string }>>([]);
  const [manualUid, setManualUid] = useState('');
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Active Slot Countdown
  const [activeSlotText, setActiveSlotText] = useState<string>('');
  const [slotClosingSoon, setSlotClosingSoon] = useState(false);

  const {
    isOnline,
    pendingCount,
    isSyncing,
    syncProgress,
    lastSuccessAt,
    failures,
    triggerSync,
    refreshPendingState,
  } = useAutoSync(organizationId);

  const currentEvent = events.find((e) => e.id === selectedEventId);

  // Cache only the minimal roster projection for this organization and active event.
  useEffect(() => {
    if (!organizationId || !selectedEventId || students.length === 0) return;
    const roster = students.map(({ uid, full_name, avatar_url, status }) => ({
      uid,
      full_name,
      avatar_url,
      status,
    }));
    Promise.all([
      offlineDB.cacheRoster(organizationId, selectedEventId, roster),
      offlineDB.cacheStudentAvatars(organizationId, selectedEventId, roster),
    ]).catch(() => undefined);
  }, [organizationId, selectedEventId, students]);

  // Update Slot Timer
  useEffect(() => {
    if (!currentEvent?.slots || currentEvent.slots.length === 0) {
      const resetTimer = setTimeout(() => setActiveSlotText(''), 0);
      return () => clearTimeout(resetTimer);
    }

    const interval = setInterval(() => {
      const now = new Date();
      const activeSlot = currentEvent.slots?.find((s) => {
        const op = new Date(s.opens_at);
        const cl = new Date(s.closes_at);
        return now >= op && now <= cl;
      });

      if (!activeSlot) {
        setActiveSlotText('No active attendance window');
        setSlotClosingSoon(false);
      } else {
        const diffMs = new Date(activeSlot.closes_at).getTime() - now.getTime();
        const mins = Math.max(0, Math.floor(diffMs / 60000));
        setActiveSlotText(`${activeSlot.label} (closes in ${mins}m)`);
        setSlotClosingSoon(mins <= 5);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentEvent]);

  // Core Scan Handler with Instant Local Write + 3s Timeout
  const handleProcessScan = async (rawUid: string) => {
      const uid = rawUid.trim();
      if (!uid || !selectedEventId) return;

      const clientId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const timestamp = new Date().toISOString();
      const matchedStudent = students.find((s) => s.uid.toLowerCase() === uid.toLowerCase());
      const studentName = matchedStudent?.full_name || uid;

      const pendingScan: PendingScan = {
        client_id: clientId,
        organization_id: organizationId,
        student_uid: uid,
        event_id: selectedEventId,
        officer_name: officerName,
        officer_id: officerId,
        timestamp,
        attempts: 0,
        failure: null,
      };

      // 1. Optimistic Local Save
      await offlineDB.savePendingScan(pendingScan);

      await offlineDB.saveDeviceScanHistory({
        client_id: clientId,
        organization_id: organizationId,
        scope_key: buildOfflineScope(organizationId, selectedEventId),
        student_uid: uid,
        student_name: studentName,
        event_name: currentEvent?.name || 'Event',
        event_id: selectedEventId,
        officer: officerName,
        timestamp,
        sync_status: 'pending_offline',
      });

      refreshPendingState();

      // 2. Try Server Record with 3-second Timeout
      const isOnline = navigator.onLine;

      if (isOnline) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), 3000)
          );

          const recordPromise = recordScanAction({
            student_uid: uid,
            event_id: selectedEventId,
            client_id: clientId,
            timestamp,
          });

          const res = await Promise.race([recordPromise, timeoutPromise]);

          if (res.success) {
            await offlineDB.removePendingScan(clientId);
            await offlineDB.updateDeviceScanHistory(clientId, 'synced');
            setLastScan({
              status: 'present',
              name: res.data.student_name,
              uid,
              avatar_url: matchedStudent?.avatar_url || null,
              detail: 'Attendance Recorded',
            });
            setRecentScans((prev) => [
              { name: res.data.student_name, status: 'Present', time: new Date().toLocaleTimeString() },
              ...prev.slice(0, 9),
            ]);
            playBeep('ok');
            refreshPendingState();
            return;
          } else if (res.code === 'DUPLICATE') {
            await offlineDB.removePendingScan(clientId);
            await offlineDB.updateDeviceScanHistory(clientId, 'duplicate', res.error);
            setLastScan({
              status: 'dup',
              name: studentName,
              uid,
              avatar_url: matchedStudent?.avatar_url || null,
              detail: 'Already Scanned for this window',
            });
            setRecentScans((prev) => [
              { name: studentName, status: 'Duplicate', time: new Date().toLocaleTimeString() },
              ...prev.slice(0, 9),
            ]);
            playBeep('dup');
            refreshPendingState();
            return;
          } else {
            const reconciliation = reconcileSyncResults([pendingScan], [{
              client_id: clientId,
              success: false,
              code: res.code || 'INVALID_SCAN',
              error: res.error,
            }]);
            const retained = reconciliation.retained[0];
            await offlineDB.savePendingScan(retained);
            await offlineDB.updateDeviceScanHistory(
              clientId,
              retained.failure?.retriable ? 'error' : 'invalid',
              retained.failure?.message || res.error
            );
            setLastScan({
              status: 'invalid',
              name: studentName,
              uid,
              avatar_url: matchedStudent?.avatar_url || null,
              detail: res.error || 'Invalid Scan',
            });
            refreshPendingState();
            playBeep('err');
            return;
          }
        } catch {
          // Timeout or Network Failure — falls through to offline queued
        }
      }

      // Offline / Timeout Fallback
      setLastScan({
        status: 'offline_queued',
        name: studentName,
        uid,
        avatar_url: matchedStudent?.avatar_url || null,
        detail: 'Saved locally to this device and queued for synchronization.',
      });
      setRecentScans((prev) => [
        { name: `${studentName} (Offline)`, status: 'Queued', time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ]);
      playBeep('ok');
  };

  // NFC/NDEF integration is intentionally disabled until the native HCE path is selected.
  // The Web NFC hook remains available as future preparation; QR is the only active input.

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUid.trim()) return;
    startTransition(() => {
      handleProcessScan(manualUid.trim());
      setManualUid('');
    });
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Top Event Selection & Sync Status */}
      <div className="p-4 bg-white border border-[#E5EBE5] rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex-1 min-w-0">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Active Event
          </label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            disabled={openEvents.length === 0}
            className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-900 font-semibold focus:outline-none focus:border-[#2D6A4F]"
          >
            {openEvents.length === 0 ? (
              <option>No open events currently scheduled</option>
            ) : (
              openEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} — {ev.venue}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex flex-col items-stretch sm:items-end gap-1.5 text-[11px]">
          <div className={`flex items-center gap-1.5 font-bold ${isOnline ? 'text-[#1B4332]' : 'text-amber-800'}`}>
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'Online' : 'Offline'} · {pendingCount} pending</span>
          </div>
          {isSyncing && (
            <span className="text-slate-500">Syncing {syncProgress.completed} of {syncProgress.total}</span>
          )}
          {!isSyncing && lastSuccessAt && (
            <span className="text-slate-500">Last synced {new Date(lastSuccessAt).toLocaleTimeString()}</span>
          )}
          {pendingCount > 0 && (
          <button
            onClick={triggerSync}
            disabled={isSyncing || !isOnline}
            className="bg-[#EBF5EE] border border-[#C2E0CC] text-[#1B4332] hover:bg-[#d8eedf] px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors self-end sm:self-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync {pendingCount} Offline Scan{pendingCount === 1 ? '' : 's'}</span>
          </button>
          )}
        </div>
      </div>

      {failures.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 text-amber-950 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold">
            <AlertTriangle className="w-4 h-4" />
            <span>{failures.length} scan{failures.length === 1 ? '' : 's'} need review</span>
          </div>
          <div className="space-y-1">
            {failures.slice(0, 3).map((failure) => (
              <div key={failure.client_id} className="text-[11px] flex flex-col sm:flex-row sm:justify-between gap-1">
                <span>{failure.message}</span>
                <span className="font-mono text-amber-800">
                  {failure.retriable ? 'Will retry' : 'Manual review required'} · attempt {failure.attempts}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Time Window Pill */}
      {activeSlotText && (
        <div
          className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between transition-colors ${
            slotClosingSoon
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-[#EBF5EE] border-[#C2E0CC] text-[#1B4332]'
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#2D6A4F]" />
            <span>Active Window: {activeSlotText}</span>
          </div>
        </div>
      )}

      {/* Scanner & Live Feedback Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Camera View */}
        <div className="p-5 bg-white border border-[#E5EBE5] rounded-3xl flex flex-col justify-between space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#2D6A4F]" />
              <span>Camera Stream</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
                title="Switch Rear/Front Camera"
                className="p-2 rounded-xl bg-[#F8FAF9] border border-[#E5EBE5] text-slate-600 hover:text-slate-900"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCameraActive((a) => !a)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  cameraActive
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-[#2D6A4F] text-white hover:bg-[#1B4332]'
                }`}
              >
                {cameraActive ? 'Stop' : 'Start Camera'}
              </button>
            </div>
          </div>

          <QrScannerComponent onScan={handleProcessScan} facingMode={facingMode} active={cameraActive} />

          {/* Manual UID Fallback Form */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Or type/paste Student UID..."
              value={manualUid}
              onChange={(e) => setManualUid(e.target.value)}
              disabled={openEvents.length === 0}
              className="flex-1 bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F]"
            />
            <button
              type="submit"
              disabled={isPending || !manualUid.trim() || openEvents.length === 0}
              className="px-4 py-2 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Record</span>
            </button>
          </form>
        </div>

        {/* Right Column: Live Status Banner & Recent Feed */}
        <div className="flex flex-col space-y-4">
          {/* Prominent Scan Feedback Banner */}
          <div className="p-6 bg-white border border-[#E5EBE5] rounded-3xl flex flex-col items-center justify-center text-center min-h-[160px] shadow-xs">
            {!lastScan ? (
              <div className="flex flex-col items-center gap-2 text-xs font-medium text-muted-foreground">
                <Camera className="w-8 h-8 opacity-40 text-[#2D6A4F]" />
                <span>Ready to scan badge or enter student UID.</span>
              </div>
            ) : lastScan.status === 'present' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-3">
                  {lastScan.avatar_url ? (
                    <img
                      src={lastScan.avatar_url}
                      alt={lastScan.name}
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-[#2D6A4F] shadow-sm"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-[#EBF5EE] text-[#1B4332] border-2 border-[#C2E0CC] flex items-center justify-center font-extrabold text-base">
                      {lastScan.name?.[0] || 'S'}
                    </div>
                  )}
                  <CheckCircle2 className="w-8 h-8 text-[#2D6A4F]" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-[#1B4332] uppercase tracking-wider">✓ Present Recorded</div>
                  <div className="text-base font-extrabold text-slate-900">{lastScan.name}</div>
                  <div className="text-xs font-mono text-slate-500">{lastScan.uid}</div>
                </div>
              </div>
            ) : lastScan.status === 'dup' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-3">
                  {lastScan.avatar_url ? (
                    <img
                      src={lastScan.avatar_url}
                      alt={lastScan.name}
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-500 shadow-sm"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-900 border-2 border-amber-200 flex items-center justify-center font-extrabold text-base">
                      {lastScan.name?.[0] || 'S'}
                    </div>
                  )}
                  <AlertTriangle className="w-8 h-8 text-amber-600" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-amber-800 uppercase tracking-wider">Already Scanned</div>
                  <div className="text-base font-extrabold text-slate-900">{lastScan.name}</div>
                  <div className="text-xs text-amber-700 font-medium">{lastScan.detail}</div>
                </div>
              </div>
            ) : lastScan.status === 'offline_queued' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-3">
                  {lastScan.avatar_url ? (
                    <img
                      src={lastScan.avatar_url}
                      alt={lastScan.name}
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-sky-500 shadow-sm"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-900 border-2 border-sky-200 flex items-center justify-center font-extrabold text-base">
                      {lastScan.name?.[0] || 'S'}
                    </div>
                  )}
                  <CheckCircle2 className="w-8 h-8 text-sky-600" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-sky-800 uppercase tracking-wider">⚡ Saved Offline</div>
                  <div className="text-base font-extrabold text-slate-900">{lastScan.name}</div>
                  <div className="text-xs text-slate-600 font-medium">{lastScan.detail}</div>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <XCircle className="w-10 h-10 text-red-600 mx-auto" />
                <div className="text-sm font-extrabold text-red-800 uppercase tracking-wider">✕ Invalid Scan</div>
                <div className="text-xs text-slate-700 font-mono">{lastScan.uid}</div>
                <div className="text-xs text-red-600 font-medium">{lastScan.detail}</div>
              </div>
            )}
          </div>

          {/* Recent Scans Session Feed */}
          <div className="p-5 bg-white border border-[#E5EBE5] rounded-3xl flex-1 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-900">Recent Scans This Session</h4>
              {userRole === 'admin' && (
                <button
                  onClick={() => setIsOverrideOpen(true)}
                  className="text-[11px] text-[#2D6A4F] font-bold hover:underline flex items-center gap-1"
                >
                  <UserCheck className="w-3 h-3" />
                  Manual Override
                </button>
              )}
            </div>

            <div className="space-y-2 flex-1 max-h-48 overflow-y-auto pr-1">
              {recentScans.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">No scans recorded in this session yet.</div>
              ) : (
                recentScans.map((sc, i) => (
                  <div key={i} className="p-2.5 rounded-xl bg-[#F8FAF9] border border-[#E5EBE5] flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{sc.name}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          sc.status === 'Present'
                            ? 'bg-[#EBF5EE] text-[#1B4332] border border-[#C2E0CC]'
                            : sc.status === 'Queued'
                            ? 'bg-sky-50 text-sky-800 border border-sky-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {sc.status}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">{sc.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Manual Override Dialog */}
      <ManualOverrideDialog
        students={students}
        events={events}
        isOpen={isOverrideOpen}
        onClose={() => setIsOverrideOpen(false)}
        onSuccess={() => {
          setRecentScans((prev) => [
            { name: 'Admin Override', status: 'Present', time: new Date().toLocaleTimeString() },
            ...prev,
          ]);
        }}
      />
    </div>
  );
}
