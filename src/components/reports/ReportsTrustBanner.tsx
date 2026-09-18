import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import type { ReportPeriodTrust } from '../../utils/reportTrust';

interface Props {
  trust: ReportPeriodTrust;
  canNavigateApuracao: boolean;
  onGoApuracao?: () => void;
  onReload?: () => void;
  isReloading?: boolean;
}

export const ReportsTrustBanner: React.FC<Props> = ({
  trust,
  canNavigateApuracao,
  onGoApuracao,
  onReload,
  isReloading,
}) => {
  const { t } = useTranslation('reports');

  const isAlert = trust.level === 'empty' || trust.level === 'partial';
  const isDraft = trust.level === 'draft';

  const tone = isAlert
    ? 'border-amber-200 bg-amber-50 text-amber-950'
    : isDraft
      ? 'border-sky-200 bg-sky-50 text-sky-950'
      : 'border-emerald-200 bg-emerald-50 text-emerald-950';

  const Icon = isAlert ? AlertTriangle : trust.level === 'ok' ? CheckCircle2 : Info;

  const titleKey =
    trust.level === 'empty'
      ? 'trust.emptyTitle'
      : trust.level === 'partial'
        ? 'trust.partialTitle'
        : trust.level === 'draft'
          ? 'trust.draftTitle'
          : 'trust.okTitle';

  const bodyKey =
    trust.level === 'empty'
      ? 'trust.emptyBody'
      : trust.level === 'partial'
        ? 'trust.partialBody'
        : trust.level === 'draft'
          ? 'trust.draftBody'
          : 'trust.okBody';

  const statusLabel = trust.primaryStatus
    ? t(`trust.periodStatus.${trust.primaryStatus}`, { defaultValue: trust.primaryStatus })
    : t('trust.periodStatus.unknown');

  const showApuracaoCta = canNavigateApuracao && (trust.level === 'empty' || trust.level === 'partial' || trust.level === 'draft');

  return (
    <div className={`rounded-xl border px-4 py-3 flex flex-col sm:flex-row gap-3 sm:items-start ${tone}`}>
      <Icon size={18} className="shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-semibold">{t(titleKey)}</p>
        <p className="text-[11px] leading-relaxed opacity-90">{t(bodyKey)}</p>
        <p className="text-[10px] opacity-75">
          {t('trust.coverageLine', {
            pct: Math.round(trust.coverageRatio * 100),
            rows: trust.ptrpRowCount,
            status: statusLabel,
          })}
        </p>
        {isAlert ? (
          <p className="text-[10px] opacity-80">{t('trust.gapNote')}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        {onReload ? (
          <button
            type="button"
            onClick={onReload}
            disabled={isReloading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-current/20 bg-white/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider hover:bg-white disabled:opacity-50"
          >
            <RefreshCw size={14} className={isReloading ? 'animate-spin' : ''} />
            {t('trust.reload')}
          </button>
        ) : null}
        {showApuracaoCta && onGoApuracao ? (
          <button
            type="button"
            onClick={onGoApuracao}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-md hover:bg-primary-hover"
          >
            {t('apuracaoIntroCta')}
          </button>
        ) : null}
      </div>
    </div>
  );
};
