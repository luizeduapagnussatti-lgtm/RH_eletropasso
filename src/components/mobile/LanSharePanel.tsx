import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, Link2, MessageCircle } from 'lucide-react';
import { getLanShareUrl, isUnshareableHostname, needsLanClientSetup } from '../../config/lanAccess';
import { useToast } from '../../context/ToastContext';

type Variant = 'light' | 'dark';

interface Props {
  variant?: Variant;
  compact?: boolean;
  /** Login / tight layouts: shorter copy, no WhatsApp/setup essays */
  dense?: boolean;
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

export const LanSharePanel: React.FC<Props> = ({
  variant = 'light',
  compact = false,
  dense = false,
}) => {
  const { t } = useTranslation('mobile');
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => getLanShareUrl(), []);

  const showSetupHint = useMemo(() => {
    if (dense) return false;
    if (typeof window === 'undefined') return true;
    return needsLanClientSetup(window.location.hostname);
  }, [dense]);

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
  const shellClass = dense
    ? 'space-y-1.5'
    : compact
      ? isDark
        ? 'rounded-xl border border-white/10 bg-white/5 p-3 space-y-2'
        : 'rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2'
      : isDark
        ? 'rounded-xl border border-white/10 bg-white/5 p-4 space-y-3'
        : 'rounded-2xl border border-primary/20 bg-primary-light/40 p-4 space-y-3';

  return (
    <div className={shellClass}>
      <div className={`flex ${dense ? 'gap-2 items-center' : 'gap-3 items-start'}`}>
        {!dense && (
          <div
            className={
              isDark
                ? 'p-2 rounded-xl bg-white/10 text-slate-200 shrink-0'
                : 'p-2 rounded-xl bg-primary/10 text-primary shrink-0'
            }
          >
            <Link2 size={18} aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={`${dense ? 'text-xs' : 'text-sm'} font-semibold ${
              isDark ? 'text-white' : 'text-slate-800'
            }`}
          >
            {dense && (
              <Link2 size={12} className="inline-block mr-1.5 -mt-0.5 opacity-70" aria-hidden />
            )}
            {t('lanShareTitle')}
          </p>
          <p
            className={`${dense ? 'text-[11px] mt-0.5 leading-snug' : 'text-xs mt-1 leading-relaxed'} ${
              isDark ? 'text-slate-400' : 'text-slate-600'
            }`}
          >
            {t(dense ? 'lanShareHintShort' : 'lanShareHint')}
          </p>
        </div>
      </div>

      <div
        className={
          isDark
            ? `flex gap-1.5 rounded-lg border border-white/10 bg-black/30 ${dense ? 'p-1.5' : 'p-2'} flex-col sm:flex-row`
            : `flex gap-1.5 rounded-lg border border-slate-200 bg-white ${dense ? 'p-1.5' : 'p-2'} flex-col sm:flex-row`
        }
      >
        <code
          className={`flex-1 font-mono break-all select-all py-0.5 px-1 ${
            dense ? 'text-[10px] leading-tight' : 'text-xs sm:text-sm'
          } ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}
        >
          {shareUrl}
        </code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={
            isDark
              ? `shrink-0 ${dense ? 'h-8 px-2.5' : 'h-9 px-3'} rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5`
              : `shrink-0 ${dense ? 'h-8 px-2.5' : 'h-9 px-3'} rounded-lg bg-primary text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:opacity-90`
          }
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? t('lanShareCopiedShort') : t('lanShareCopy')}
        </button>
      </div>

      {!dense && (
        <div
          className={`flex gap-2 text-[11px] leading-relaxed ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          <MessageCircle size={14} className="shrink-0 mt-0.5" aria-hidden />
          <p>{t('lanShareWhatsAppTip')}</p>
        </div>
      )}

      {showSetupHint && (
        <p className={`text-[11px] leading-relaxed ${isDark ? 'text-amber-300/90' : 'text-amber-700'}`}>
          {t('lanShareSetupHint')}
        </p>
      )}

      {!dense &&
        isUnshareableHostname(typeof window !== 'undefined' ? window.location.hostname : '') && (
          <p className={`text-[11px] leading-relaxed ${isDark ? 'text-amber-300/90' : 'text-amber-700'}`}>
            {t('lanShareHostWarning')}
          </p>
        )}
    </div>
  );
};
