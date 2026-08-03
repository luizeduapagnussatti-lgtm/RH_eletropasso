import React from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, ClipboardList, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isPjContractor } from '../../utils/roles';
import { LanSharePanel } from './LanSharePanel';

interface Props {
  onNavigate: (path: string) => void;
  pendingSign?: boolean;
}

export const PwaLanBanner: React.FC<{ variant?: 'light' | 'dark' }> = ({ variant = 'light' }) => {
  const { t } = useTranslation('mobile');
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return localStorage.getItem('openhr_pwa_lan_dismissed') === '1';
    } catch {
      return false;
    }
  });

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

  if (dismissed || isStandalone) return null;

  const isDark = variant === 'dark';

  return (
    <div
      className={
        isDark
          ? 'rounded-xl border border-white/10 bg-white/5 p-4 space-y-4'
          : 'rounded-2xl border border-primary/20 bg-primary-light/40 p-4 space-y-4'
      }
    >
      <LanSharePanel variant={variant} compact />

      <div className="flex gap-3 items-start">
        <div
          className={
            isDark
              ? 'p-2 rounded-xl bg-white/10 text-slate-200 shrink-0'
              : 'p-2 rounded-xl bg-primary/10 text-primary shrink-0'
          }
        >
          <Download size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>
            {t('pwaLanTitle')}
          </p>
          <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {t('pwaLanHint')}
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem('openhr_pwa_lan_dismissed', '1');
              } catch {
                /* ignore */
              }
              setDismissed(true);
            }}
            className={`mt-2 text-[10px] font-bold uppercase tracking-widest ${
              isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export const EmployeeMobileShortcuts: React.FC<Props> = ({ onNavigate, pendingSign }) => {
  const { t } = useTranslation('mobile');
  const { user } = useAuth();
  const isPj = isPjContractor(user);

  return (
    <div className="space-y-3 animate-in slide-in-from-bottom-4">
      <PwaLanBanner />

      {!isPj && pendingSign && (
        <button
          type="button"
          onClick={() => onNavigate('my-timesheet')}
          className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-left active:scale-[0.98] transition-transform"
        >
          <div>
            <p className="text-xs font-semibold text-amber-800">{t('pendingSignTitle')}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mt-1">
              {t('pendingSignAction')}
            </p>
          </div>
          <ClipboardList size={20} className="text-amber-600 shrink-0" aria-hidden />
        </button>
      )}

      <div className={`grid gap-3 ${isPj ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {!isPj && (
          <button
            type="button"
            onClick={() => onNavigate('my-timesheet')}
            className="flex flex-col gap-2 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm text-left active:scale-[0.98] transition-transform min-h-[100px]"
          >
            <ClipboardList size={20} className="text-primary" aria-hidden />
            <span className="text-sm font-semibold text-slate-800">{t('shortcutTimesheet')}</span>
            <span className="text-[10px] text-slate-500 leading-snug">{t('shortcutTimesheetHint')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onNavigate('my-roster')}
          className="flex flex-col gap-2 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm text-left active:scale-[0.98] transition-transform min-h-[100px]"
        >
          <CalendarCheck size={20} className="text-primary" aria-hidden />
          <span className="text-sm font-semibold text-slate-800">{t('shortcutRoster')}</span>
          <span className="text-[10px] text-slate-500 leading-snug">{t('shortcutRosterHint')}</span>
        </button>
      </div>
    </div>
  );
};
