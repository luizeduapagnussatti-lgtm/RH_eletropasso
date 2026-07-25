import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import type { ClockCommandLogEntry } from '../../types';

export const ClockAuditTab: React.FC = () => {
  const { t } = useTranslation('timeClock');
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<ClockCommandLogEntry[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const list = await hrService.listClockCommands();
      setEntries(list);
    } catch (error) {
      console.error('[ClockAudit] load failed', error);
      showToast(t('audit.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('audit.title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('audit.hint')}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {t('refresh')}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
        {entries.length === 0 && !loading ? (
          <p className="p-5 text-sm text-slate-500">{t('audit.empty')}</p>
        ) : (
          <div className="overflow-x-auto max-h-[32rem]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-400 sticky top-0">
                <tr>
                  <th className="px-3 py-2">{t('audit.operation')}</th>
                  <th className="px-3 py-2">{t('audit.status')}</th>
                  <th className="px-3 py-2">{t('audit.time')}</th>
                  <th className="px-3 py-2">{t('audit.error')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const ok = String(entry.status).toUpperCase() === 'SUCCESS';
                  return (
                    <tr key={entry.id} className="border-t border-slate-50">
                      <td className="px-3 py-2 font-mono text-xs text-slate-800">{entry.operation}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                            ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                          }`}
                        >
                          {ok ? t('audit.success') : t('audit.failed')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                        {entry.created ? new Date(entry.created).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-rose-700 max-w-xs truncate" title={entry.errorMessage}>
                        {entry.errorMessage || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
