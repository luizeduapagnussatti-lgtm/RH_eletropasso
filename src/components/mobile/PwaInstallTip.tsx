import React from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';

const DISMISS_KEY = 'openhr_pwa_install_tip_dismissed';

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

interface Props {
  /** Conta: always show until installed. Home: hide after dismiss. */
  persistent?: boolean;
  className?: string;
}

/**
 * Slim “add to home screen” tip — no LAN share panel.
 * Hidden when already running as installed PWA.
 */
export const PwaInstallTip: React.FC<Props> = ({ persistent = false, className = '' }) => {
  const { t } = useTranslation('mobile');
  const [dismissed, setDismissed] = React.useState(() => {
    if (persistent) return false;
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (isStandalonePwa() || dismissed) return null;

  return (
    <div
      className={`flex gap-3 items-start rounded-xl border border-primary/20 bg-primary-light/40 p-3 ${className}`}
      role="status"
    >
      <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0" aria-hidden>
        <Download size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{t('pwaInstallTitle')}</p>
        <p className="text-xs mt-0.5 leading-relaxed text-slate-600">{t('pwaInstallHint')}</p>
        {!persistent ? (
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(DISMISS_KEY, '1');
              } catch {
                /* ignore */
              }
              setDismissed(true);
            }}
            className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600"
          >
            {t('pwaInstallDismiss')}
          </button>
        ) : null}
      </div>
    </div>
  );
};
