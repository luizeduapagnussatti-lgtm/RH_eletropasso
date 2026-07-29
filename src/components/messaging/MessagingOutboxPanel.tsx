import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, RotateCcw, Mail, MessageCircle } from 'lucide-react';
import { messagingService } from '../../services/messaging.service';
import type { MessagingOutboxEntry } from '../../types';
import { useToast } from '../../context/ToastContext';

interface Props {
  referenceType?: string;
  referenceId?: string;
}

export const MessagingOutboxPanel: React.FC<Props> = ({ referenceType, referenceId }) => {
  const { t } = useTranslation('messaging');
  const { showToast } = useToast();
  const [rows, setRows] = useState<MessagingOutboxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await messagingService.listOutbox({
        referenceType,
        referenceId,
        status: statusFilter || undefined,
        limit: 300,
      });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [referenceType, referenceId, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      const result = await messagingService.retryOutbox(id);
      if (result.status === 'SENT') {
        showToast(t('retrySuccess'), 'success');
      } else {
        showToast(result.error || t('retryFailed'), 'error');
      }
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('retryFailed'), 'error');
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryFailed = async () => {
    const failed = rows.filter(r => r.status === 'FAILED');
    for (const row of failed) {
      try {
        await messagingService.retryOutbox(row.id);
      } catch { /* continue */ }
    }
    showToast(t('retryBatchDone'), 'info');
    await load();
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      SENT: 'bg-emerald-100 text-emerald-800',
      FAILED: 'bg-rose-100 text-rose-800',
      SKIPPED: 'bg-amber-100 text-amber-800',
      PENDING: 'bg-slate-100 text-slate-600',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colors[status] ?? colors.PENDING}`}>
        {t(`status.${status}`)}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-2">
          {['', 'SENT', 'FAILED', 'SKIPPED'].map(s => (
            <button
              key={s || 'all'}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                statusFilter === s ? 'bg-primary text-white border-primary' : 'border-slate-200 text-slate-600'
              }`}
            >
              {s ? t(`status.${s}`) : t('filterAll')}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200">
            <RefreshCw size={14} /> {t('refresh')}
          </button>
          {rows.some(r => r.status === 'FAILED') && (
            <button type="button" onClick={() => void handleRetryFailed()} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
              <RotateCcw size={14} /> {t('retryAllFailed')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center text-slate-400">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-12">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('colChannel')}</th>
                <th className="px-4 py-3">{t('colRecipient')}</th>
                <th className="px-4 py-3">{t('colSubject')}</th>
                <th className="px-4 py-3">{t('colStatus')}</th>
                <th className="px-4 py-3">{t('colSentAt')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs font-medium">
                      {row.channel === 'EMAIL' ? <Mail size={14} /> : <MessageCircle size={14} />}
                      {t(`channel.${row.channel}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{row.recipient || '—'}</td>
                  <td className="px-4 py-3 text-xs max-w-[200px] truncate">{row.subject || row.body.slice(0, 60)}</td>
                  <td className="px-4 py-3">{statusBadge(row.status)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {row.sentAt ? new Date(row.sentAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.status === 'FAILED' && (
                      <button
                        type="button"
                        disabled={retryingId === row.id}
                        onClick={() => void handleRetry(row.id)}
                        className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                      >
                        {retryingId === row.id ? <Loader2 size={14} className="animate-spin inline" /> : t('retry')}
                      </button>
                    )}
                    {row.errorMessage && (
                      <p className="text-[10px] text-rose-500 mt-1 max-w-[160px] truncate" title={row.errorMessage}>
                        {row.errorMessage}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MessagingOutboxPanel;
