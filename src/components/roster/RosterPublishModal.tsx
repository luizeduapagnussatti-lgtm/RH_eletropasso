import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, Send, X, FileText, Mail, MessageCircle } from 'lucide-react';
import type { MessagingChannel } from '../../types';
import { messagingService } from '../../services/messaging.service';
import { organizationService } from '../../services/organization.service';
import { rosterPdfService, type RosterPdfLabels } from '../../services/rosterPdf.service';
import { MessagingRecipientPicker } from '../messaging/MessagingRecipientPicker';
import {
  countDispatchItems,
  estimateDispatchDurationMs,
  filterEligibleEmployees,
  formatDurationSeconds,
  isEligibleForChannel,
  resolveThrottleFromConfig,
} from '../../utils/messagingThrottle';
import type { Employee, Holiday, Shift, WorkRosterAssignment } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  month: number;
  employees: Employee[];
  shifts: Shift[];
  holidays: Holiday[];
  rosterAssignments: WorkRosterAssignment[];
  pdfLabels: RosterPdfLabels;
  locale: string;
  onComplete?: (summary: { sent: number; failed: number; skipped: number }) => void;
}

export const RosterPublishModal: React.FC<Props> = ({
  isOpen,
  onClose,
  year,
  month,
  employees,
  shifts,
  holidays,
  rosterAssignments,
  pdfLabels,
  locale,
  onComplete,
}) => {
  const { t } = useTranslation('roster');
  const { t: tm } = useTranslation('messaging');
  const [channels, setChannels] = useState<MessagingChannel[]>(['EMAIL', 'WHATSAPP']);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmSend, setConfirmSend] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'generating' | 'sending' | 'done'>('idle');
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState<{ sent: number; failed: number; skipped: number; paused?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estSeconds, setEstSeconds] = useState(0);

  const externalChannels = useMemo(
    () => channels.filter(c => c === 'EMAIL' || c === 'WHATSAPP') as ('EMAIL' | 'WHATSAPP')[],
    [channels],
  );

  const selectedEmployees = useMemo(
    () => employees.filter(e => selectedIds.has(e.id)),
    [employees, selectedIds],
  );

  const dispatchPreview = useMemo(() => {
    let wa = 0;
    let em = 0;
    for (const emp of selectedEmployees) {
      if (externalChannels.includes('WHATSAPP') && isEligibleForChannel(emp, 'WHATSAPP')) wa++;
      if (externalChannels.includes('EMAIL') && isEligibleForChannel(emp, 'EMAIL')) em++;
    }
    return { wa, em, total: wa + em };
  }, [selectedEmployees, externalChannels]);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmSend(false);
    setSummary(null);
    setError(null);
    setPhase('idle');
    setProgress('');
    const eligible = filterEligibleEmployees(employees, channels);
    setSelectedIds(new Set(eligible.map(e => e.id)));
  }, [isOpen, employees, channels]);

  useEffect(() => {
    if (!isOpen) return;
    void organizationService.getMessagingConfig().then(cfg => {
      const throttle = resolveThrottleFromConfig(cfg);
      const ms = estimateDispatchDurationMs(dispatchPreview.wa, dispatchPreview.em, throttle);
      setEstSeconds(formatDurationSeconds(ms));
    });
  }, [isOpen, dispatchPreview.wa, dispatchPreview.em]);

  if (!isOpen) return null;

  const toggleChannel = (ch: MessagingChannel) => {
    if (ch === 'APP') return;
    setChannels(prev => (prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]));
  };

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const referenceId = `${year}-${String(month).padStart(2, '0')}`;

  const handlePublish = async () => {
    if (!confirmSend) {
      setConfirmSend(true);
      return;
    }

    setError(null);
    setSummary(null);
    const external = channels.filter(c => c === 'EMAIL' || c === 'WHATSAPP');
    if (external.length === 0) {
      setError(t('publishNeedChannel'));
      return;
    }
    if (selectedIds.size === 0) {
      setError(t('publishNoRecipientsSelected'));
      return;
    }

    const targets = employees.filter(e => selectedIds.has(e.id));
    const itemCount = countDispatchItems(targets, channels);
    if (itemCount === 0) {
      setError(t('publishNoRecipients'));
      setPhase('idle');
      setConfirmSend(false);
      return;
    }

    try {
      setPhase('generating');
      setProgress(t('publishGeneratingPdf'));
      const pdfMap = await rosterPdfService.generateIndividualPdfsForTeam({
        year,
        month,
        employees: targets,
        shifts,
        holidays,
        rosterAssignments,
        labels: pdfLabels,
        locale,
      });

      setPhase('sending');
      setProgress(t('publishSending'));
      const items = messagingService.buildRosterPublishItems(
        employees,
        external,
        monthLabel,
        pdfMap,
        referenceId,
        selectedIds,
      );

      const result = await messagingService.dispatchBatchSafe(items, {
        onProgress: msg => setProgress(msg),
      });

      setSummary(result);
      setPhase('done');
      setConfirmSend(false);
      onComplete?.({ sent: result.sent, failed: result.failed, skipped: result.skipped });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : t('publishError'));
      setPhase('idle');
      setConfirmSend(false);
    }
  };

  const busy = phase === 'generating' || phase === 'sending';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <Send size={18} className="text-primary" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('publishTitle')}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('publishDesc', { month: monthLabel })}</p>

          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase">{t('publishChannels')}</p>
            <div className="flex flex-wrap gap-2">
              {(['EMAIL', 'WHATSAPP'] as const).map(ch => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(ch)}
                  disabled={busy}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    channels.includes(ch)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 border-slate-200'
                  }`}
                >
                  {ch === 'EMAIL' ? <Mail size={14} /> : <MessageCircle size={14} />}
                  {t(`channel.${ch}`)}
                </button>
              ))}
            </div>
          </div>

          <MessagingRecipientPicker
            employees={employees}
            channels={channels}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            disabled={busy}
          />

          {dispatchPreview.total > 0 && (
            <p className="text-xs text-slate-500">
              {tm('dispatchPreview', {
                total: dispatchPreview.total,
                whatsapp: dispatchPreview.wa,
                email: dispatchPreview.em,
                seconds: estSeconds,
              })}
            </p>
          )}

          <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
            <FileText size={14} className="shrink-0 mt-0.5" />
            <span>{t('publishPdfHint')}</span>
          </div>

          {confirmSend && !busy && phase !== 'done' && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{tm('confirmDispatch', { count: dispatchPreview.total, seconds: estSeconds })}</span>
            </div>
          )}

          {progress && busy && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <Loader2 size={16} className="animate-spin" />
              {progress}
            </div>
          )}

          {summary && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-800 dark:text-emerald-200 space-y-1">
              <p>{t('publishSummary', summary)}</p>
              {summary.paused && <p className="text-amber-700 dark:text-amber-300">{tm('batchPaused')}</p>}
            </div>
          )}

          {error && (
            <p className="text-sm text-rose-600">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-2 justify-end shrink-0">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm font-medium text-slate-600 rounded-xl hover:bg-slate-100">
            {phase === 'done' ? t('close') : t('cancel')}
          </button>
          {phase !== 'done' && (
            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={busy || dispatchPreview.total === 0}
              className="inline-flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {confirmSend ? tm('confirmSendButton') : t('publishSend')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RosterPublishModal;
