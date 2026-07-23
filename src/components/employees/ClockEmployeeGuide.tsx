import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  ChevronDown,
  Info,
  Keyboard,
} from 'lucide-react';

export type ClockGuideMode = 'admission' | 'discharge' | 'reference';

interface InteractiveProps {
  checked: boolean[];
  onToggle: (index: number) => void;
}

interface Props {
  mode: ClockGuideMode;
  compact?: boolean;
  embedded?: boolean;
  defaultExpanded?: boolean;
  referenceDefaultTab?: 'admission' | 'discharge';
  interactive?: InteractiveProps;
  highlightFirstStep?: boolean;
  employeeName?: string;
  employeeId?: string;
}

const ADMISSION_STEP_COUNT = 4;
const DISCHARGE_STEP_COUNT = 4;

function ManualKeyboardSteps({
  flow,
  employeeId,
  compact,
}: {
  flow: 'admission' | 'discharge';
  employeeId?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation('employees');
  const pis = employeeId ?? '________';
  const titleKey =
    flow === 'admission' ? 'clockGuide.manual.admissionTitle' : 'clockGuide.manual.dischargeTitle';
  const stepsKey =
    flow === 'admission' ? 'clockGuide.manual.admissionSteps' : 'clockGuide.manual.dischargeSteps';

  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 ${
        compact ? 'p-3' : 'p-4'
      } space-y-2`}
    >
      <div className="flex items-center gap-2">
        <Keyboard size={16} className="text-primary shrink-0" aria-hidden />
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t(titleKey)}</p>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-mono max-w-prose">
        {t(stepsKey, { pis })}
      </p>
      <p className="text-[10px] text-slate-400">{t('clockGuide.manual.modelNote')}</p>
    </div>
  );
}

function GuideSteps({
  flow,
  interactive,
  highlightFirstStep,
  employeeName,
  employeeId,
  compact,
}: {
  flow: 'admission' | 'discharge';
  interactive?: InteractiveProps;
  highlightFirstStep?: boolean;
  employeeName?: string;
  employeeId?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation('employees');
  const count = flow === 'admission' ? ADMISSION_STEP_COUNT : DISCHARGE_STEP_COUNT;
  const prefix = `clockGuide.${flow}`;

  return (
    <ol className={`${compact ? 'space-y-2' : 'space-y-3'} list-none p-0 m-0`}>
      {Array.from({ length: count }, (_, index) => {
        const stepNum = index + 1;
        const title = t(`${prefix}.step${stepNum}.title`);
        const detail = t(`${prefix}.step${stepNum}.detail`, {
          name: employeeName ?? '',
          employeeId: employeeId ?? '',
          pis: employeeId ?? '',
        });
        const isChecked = interactive?.checked[index] ?? false;
        const isCritical = highlightFirstStep && flow === 'discharge' && index === 0;

        const content = (
          <>
            {interactive ? (
              isChecked ? (
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" aria-hidden />
              ) : (
                <Circle size={18} className="text-slate-300 shrink-0 mt-0.5" aria-hidden />
              )
            ) : (
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isCritical
                    ? 'bg-red-100 text-red-700'
                    : 'bg-primary/10 text-primary'
                }`}
                aria-hidden
              >
                {stepNum}
              </span>
            )}
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {title}
                </span>
                {isCritical ? (
                  <span className="inline-flex text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                    {t('clockGuide.highlightCritical')}
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed max-w-prose">
                {detail}
              </span>
            </span>
          </>
        );

        const rowClass = isCritical
          ? 'rounded-lg border border-red-200 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/20 px-2 py-2 -mx-1'
          : '';

        if (interactive) {
          return (
            <li key={stepNum} className={rowClass}>
              <button
                type="button"
                onClick={() => interactive.onToggle(index)}
                className="w-full flex items-start gap-3 text-left rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 px-1 py-1 -mx-1"
              >
                {content}
              </button>
            </li>
          );
        }

        return (
          <li key={stepNum} className={`flex items-start gap-3 ${rowClass}`}>
            {content}
          </li>
        );
      })}
    </ol>
  );
}

function WarningList({ compact }: { compact?: boolean }) {
  const { t } = useTranslation('employees');
  const keys = ['pisMatch', 'bioOnClock', 'noDmprepRecadastro', 'noAutoOffboard'] as const;

  return (
    <ul
      className={`${compact ? 'space-y-1.5' : 'space-y-2'} list-disc pl-4 text-sm text-amber-950 dark:text-amber-100/90`}
    >
      {keys.map((key) => (
        <li key={key} className="leading-relaxed max-w-prose">
          {t(`clockGuide.warnings.${key}`)}
        </li>
      ))}
    </ul>
  );
}

function Glossary({ compact }: { compact?: boolean }) {
  const { t } = useTranslation('employees');
  const terms = ['pis', 'credential', 'nsr', 'dmprep', 'printpoint'] as const;

  return (
    <dl className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
      {terms.map((term) => (
        <div key={term}>
          <dt className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t(`clockGuide.glossary.${term}.term`)}
          </dt>
          <dd className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed max-w-prose">
            {t(`clockGuide.glossary.${term}.definition`)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AccordionSection({
  id,
  title,
  defaultOpen,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown
          size={16}
          className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3">{children}</div>
    </details>
  );
}

export const ClockEmployeeGuide: React.FC<Props> = ({
  mode,
  compact = false,
  embedded = false,
  defaultExpanded = false,
  referenceDefaultTab = 'admission',
  interactive,
  highlightFirstStep = false,
  employeeName,
  employeeId,
}) => {
  const { t } = useTranslation('employees');
  const [refTab, setRefTab] = useState<'admission' | 'discharge'>(referenceDefaultTab);

  const activeFlow: 'admission' | 'discharge' =
    mode === 'reference' ? refTab : mode;

  const title =
    mode === 'reference'
      ? t('clockGuide.referenceTitle')
      : activeFlow === 'admission'
        ? t('clockGuide.admissionTitle')
        : t('clockGuide.dischargeTitle');

  if (compact) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <BookOpen size={16} className="text-primary shrink-0 mt-0.5" aria-hidden />
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-prose">
            {t(`clockGuide.${activeFlow}.overview`)}
          </p>
        </div>
        <GuideSteps
          flow={activeFlow}
          interactive={interactive}
          highlightFirstStep={highlightFirstStep}
          employeeName={employeeName}
          employeeId={employeeId}
          compact
        />
        <ManualKeyboardSteps flow={activeFlow} employeeId={employeeId} compact />
      </div>
    );
  }

  const innerContent = (
    <>
      {mode === 'reference' ? (
        <div className="px-5 flex gap-2" role="tablist" aria-label={t('clockGuide.referenceTitle')}>
          {(['admission', 'discharge'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={refTab === tab}
              onClick={() => setRefTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors motion-reduce:transition-none ${
                refTab === tab
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab === 'admission'
                ? t('clockGuide.tabAdmission')
                : t('clockGuide.tabDischarge')}
            </button>
          ))}
        </div>
      ) : null}

      <div className={`${embedded ? 'space-y-3' : 'px-5 space-y-3'}`}>
        <div className="rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/50 px-4 py-3 flex gap-2">
          <Info size={18} className="text-sky-700 dark:text-sky-300 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm text-sky-950 dark:text-sky-100/90 leading-relaxed max-w-prose">
            {t(`clockGuide.${activeFlow}.overview`)}
          </p>
        </div>

        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 px-4 py-3 flex gap-2">
          <AlertTriangle size={18} className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden />
          <WarningList compact={mode !== 'reference'} />
        </div>
      </div>

      <div className={`${embedded ? 'space-y-3 mt-3' : 'px-5 pb-5 space-y-3'}`}>
        {embedded ? (
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">
              {t('clockGuide.sectionSteps')}
            </p>
            <GuideSteps
              flow={activeFlow}
              interactive={interactive}
              highlightFirstStep={highlightFirstStep}
              employeeName={employeeName}
              employeeId={employeeId}
            />
          </div>
        ) : (
          <AccordionSection
            id="clock-guide-steps"
            title={t('clockGuide.sectionSteps')}
            defaultOpen={defaultExpanded || mode !== 'reference'}
          >
            <GuideSteps
              flow={activeFlow}
              interactive={interactive}
              highlightFirstStep={highlightFirstStep}
              employeeName={employeeName}
              employeeId={employeeId}
            />
          </AccordionSection>
        )}

        {embedded ? (
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
              {t('clockGuide.sectionManual')}
            </p>
            <ManualKeyboardSteps flow={activeFlow} employeeId={employeeId} />
          </div>
        ) : (
          <AccordionSection
            id="clock-guide-manual"
            title={t('clockGuide.sectionManual')}
            defaultOpen={defaultExpanded}
          >
            <ManualKeyboardSteps flow={activeFlow} employeeId={employeeId} />
          </AccordionSection>
        )}

        {mode === 'reference' ? (
          <AccordionSection id="clock-guide-glossary" title={t('clockGuide.sectionGlossary')}>
            <Glossary />
          </AccordionSection>
        ) : null}
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-1">{innerContent}</div>;
  }

  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm space-y-4">
      <div className="px-5 pt-5 pb-0">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BookOpen size={20} aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white text-balance">
              {title}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed max-w-prose">
              {t('clockGuide.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {innerContent}
    </div>
  );
};

export { ADMISSION_STEP_COUNT, DISCHARGE_STEP_COUNT };
