import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import { Employee, RosterDayKind, RosterSwapRequest, User, WorkRosterAssignment } from '../types';
import { needsClockAdmission } from '../../utils/roles';
import { formatIsoDateBr } from '../../i18n/format';

interface Props {
  open: boolean;
  assignment: WorkRosterAssignment | null;
  colleagues: Employee[];
  onClose: () => void;
  onSent: () => void;
  requester: User;
}

const RosterSwapModal: React.FC<Props> = ({
  open,
  assignment,
  colleagues,
  onClose,
  onSent,
  requester,
}) => {
  const { t } = useTranslation('mobile');
  const { showToast } = useToast();
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  if (!open || !assignment) return null;

  const handleSend = async () => {
    if (!targetId) return;
    setSending(true);
    try {
      await hrService.createRosterSwapRequest({
        workDate: assignment.workDate,
        dayKind: assignment.dayKind as RosterDayKind,
        requesterProfileId: requester.id,
        targetProfileId: targetId,
        reason,
      });
      showToast(t('swapSent'), 'success');
      onSent();
      onClose();
    } catch (e) {
      console.error(e);
      showToast(t('swapFailed'), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">{t('swapModalTitle')}</h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4">{formatIsoDateBr(assignment.workDate)}</p>
        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
          {t('swapSelectColleague')}
        </label>
        <select
          value={targetId}
          onChange={e => setTargetId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm mb-4 bg-white"
        >
          <option value="">—</option>
          {colleagues.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
          {t('swapReason')}
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm mb-4 resize-none"
        />
        <button
          type="button"
          disabled={!targetId || sending}
          onClick={() => { void handleSend(); }}
          className="w-full py-4 bg-primary text-white rounded-2xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {sending ? <Loader2 className="animate-spin" size={18} /> : null}
          {t('swapSend')}
        </button>
      </div>
    </div>
  );
};

export default RosterSwapModal;

export function SwapRequestList({
  requests,
  userId,
  onRefresh,
}: {
  requests: RosterSwapRequest[];
  userId: string;
  onRefresh: () => void;
}) {
  const { t } = useTranslation('mobile');
  const { showToast } = useToast();

  if (requests.length === 0) return null;

  const handlePeer = async (id: string, accept: boolean) => {
    try {
      await hrService.respondRosterSwapPeer(id, accept, userId);
      onRefresh();
    } catch (e) {
      console.error(e);
      showToast(t('swapFailed'), 'error');
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await hrService.cancelRosterSwapRequest(id, userId);
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-2">
      {requests.map(req => {
        const isTarget = req.targetProfileId === userId;
        const isRequester = req.requesterProfileId === userId;
        return (
          <div key={req.id} className="rounded-xl border border-slate-100 bg-white p-3 text-sm">
            <p className="font-semibold text-slate-800">{formatIsoDateBr(req.workDate)}</p>
            <p className="text-xs text-slate-500 mt-1">
              {req.status === 'PENDING_PEER' && t('swapPeerPending')}
              {req.status === 'PENDING_MANAGER' && t('swapPendingManager')}
              {req.status === 'APPROVED' && t('swapApproved')}
              {req.status === 'REJECTED' && t('swapRejected')}
            </p>
            {req.status === 'PENDING_PEER' && isTarget && (
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => { void handlePeer(req.id, true); }}
                  className="flex-1 py-2 rounded-lg bg-primary text-white text-xs font-semibold"
                >
                  {t('swapAccept')}
                </button>
                <button
                  type="button"
                  onClick={() => { void handlePeer(req.id, false); }}
                  className="flex-1 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
                >
                  {t('swapReject')}
                </button>
              </div>
            )}
            {req.status === 'PENDING_PEER' && isRequester && (
              <button
                type="button"
                onClick={() => { void handleCancel(req.id); }}
                className="mt-3 text-xs font-semibold text-rose-600"
              >
                {t('swapCancel')}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function filterSwapColleagues(employees: Employee[], selfId: string): Employee[] {
  return employees.filter(
    e => e.id !== selfId && needsClockAdmission(e.role) && e.status !== 'INACTIVE'
  );
}
