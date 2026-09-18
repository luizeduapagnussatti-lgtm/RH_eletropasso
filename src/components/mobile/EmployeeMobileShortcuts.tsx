import React from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { LanSharePanel } from './LanSharePanel';

/**
 * Conta / setup: LAN share + install guidance.
 * Not used on the employee mobile home (see PwaInstallTip + EmployeeMobileHome).
 */
export const PwaLanBanner: React.FC<{
  variant?: 'light' | 'dark';
  /** Login: below the form — link only, minimal copy */
  dense?: boolean;
}> = ({ variant = 'light', dense = false }) => {
  const { t } = useTranslation('mobile');
  const isDark = variant === 'dark';

  if (dense) {
    return (
      <div
        className={
          isDark
            ? 'rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5'
            : 'rounded-xl border border-primary/15 bg-primary-light/30 px-3 py-2.5'
        }
      >
        <LanSharePanel variant={variant} compact dense />
      </div>
    );
  }

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
            {t('pwaInstallTitle')}
          </p>
          <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {t('pwaInstallHint')}
          </p>
        </div>
      </div>
    </div>
  );
};
