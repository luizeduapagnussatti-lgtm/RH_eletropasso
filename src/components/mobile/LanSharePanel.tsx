import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, Link2, MessageCircle } from 'lucide-react';
import { getLanShareUrl, isUnshareableHostname, needsLanClientSetup } from '../../config/lanAccess';
import { useToast } from '../../context/ToastContext';

type Variant = 'light' | 'dark';

interface Props {
  variant?: Variant;
  compact?: boolean;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export const LanSharePanel: React.FC<Props> = ({ variant = 'light', compact = false }) => {
  const { t } = useTranslation('mobile');
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => getLanShareUrl(), []);

  const showSetupHint = useMemo(() => {
    if (typeof window === 'undefined') return true;
    return needsLanClientSetup(window.location.hostname);
  }, []);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(shareUrl);
    if (ok) {
      setCopied(true);
      showToast(t('lanShareCopied'), 'success');
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      showToast(t('lanShareCopyFailed'), 'error');
    }
  }, [shareUrl, showToast, t]);

  const isDark = variant === 'dark';

  return (
    <div
      className={
        compact
          ? isDark
            ? 'rounded-xl border border-white/10 bg-white/5 p-3 space-y-2'
            : 'rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2'
          : isDark
            ? 'rounded-xl border border-white/10 bg-white/5 p-4 space-y-3'
            : 'rounded-2xl border border-primary/20 bg-primary-light/40 p-4 space-y-3'
      }
    >
      <div className="flex gap-3 items-start">
        <div
          className={
            isDark
              ? 'p-2 rounded-xl bg-white/10 text-slate-200 shrink-0'
              : 'p-2 rounded-xl bg-primary/10 text-primary shrink-0'
          }
        >
          <Link2 size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>
            {t('lanShareTitle')}
          </p>
          <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {t('lanShareHint')}
          </p>
        </div>
      </div>

      <div
        className={
          isDark
            ? 'flex flex-col sm:flex-row gap-2 rounded-lg border border-white/10 bg-black/30 p-2'
            : 'flex flex-col sm:flex-row gap-2 rounded-lg border border-slate-200 bg-white p-2'
        }
      >
        <code
          className={`flex-1 text-xs sm:text-sm font-mono break-all select-all py-1 px-1 ${
            isDark ? 'text-emerald-300' : 'text-emerald-800'
          }`}
        >
          {shareUrl}
        </code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={
            isDark
              ? 'shrink-0 h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5'
              : 'shrink-0 h-9 px-3 rounded-lg bg-primary text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:opacity-90'
          }
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? t('lanShareCopiedShort') : t('lanShareCopy')}
        </button>
      </div>

      <div
        className={`flex gap-2 text-[11px] leading-relaxed ${
          isDark ? 'text-slate-400' : 'text-slate-500'
        }`}
      >
        <MessageCircle size={14} className="shrink-0 mt-0.5" aria-hidden />
        <p>{t('lanShareWhatsAppTip')}</p>
      </div>

      {showSetupHint && (
        <p className={`text-[11px] leading-relaxed ${isDark ? 'text-amber-300/90' : 'text-amber-700'}`}>
          {t('lanShareSetupHint')}
        </p>
      )}

      {isUnshareableHostname(typeof window !== 'undefined' ? window.location.hostname : '') && (
        <p className={`text-[11px] leading-relaxed ${isDark ? 'text-amber-300/90' : 'text-amber-700'}`}>
          {t('lanShareHostWarning')}
        </p>
      )}
    </div>
  );
};
