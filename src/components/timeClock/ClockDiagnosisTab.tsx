import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  HelpCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import { useSubscription } from '../../context/SubscriptionContext';
import type { ClockCommandOp } from '../../types';
import { extractCommandData, runClockOp } from './clockCommandUi';
import {
  type HealthTone,
  asRecord,
  summarizeEmployer,
  summarizeIdentity,
  summarizeStatus,
} from './clockDiagnosisView';

interface Props {
  onBusyChange?: (busy: boolean) => void;
}

type DiagnosisKind = 'status' | 'identity' | 'employer-read';

const ALL_OPS: DiagnosisKind[] = ['status', 'identity', 'employer-read'];

export const ClockDiagnosisTab: React.FC<Props> = ({ onBusyChange }) => {
  const { t } = useTranslation('timeClock');
  const { showToast } = useToast();
  const { canPerformAction } = useSubscription();
  const canWrite = canPerformAction('write');

  const [running, setRunning] = useState<DiagnosisKind | 'all' | null>(null);
  const [cards, setCards] = useState<Partial<Record<DiagnosisKind, Record<string, unknown>>>>({});
  const [opErrors, setOpErrors] = useState<Partial<Record<DiagnosisKind, string>>>({});
  const [showRaw, setShowRaw] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const runOne = async (op: DiagnosisKind): Promise<boolean> => {
    let ok = false;
    await runClockOp(() => hrService.runClockCommand(op as ClockCommandOp), {
      onBusy: () => showToast(t('busy'), 'warning'),
      onSuccess: (result) => {
        const data = extractCommandData(result);
        setCards((prev) => ({ ...prev, [op]: data }));
        setOpErrors((prev) => {
          const next = { ...prev };
          delete next[op];
          return next;
        });
        ok = true;
      },
      onError: (message) => {
        setOpErrors((prev) => ({ ...prev, [op]: message || t('failed') }));
        showToast(message || t('failed'), 'error');
      },
    });
    return ok;
  };

  const run = async (op: DiagnosisKind) => {
    if (!canWrite) {
      showToast(t('readOnly'), 'error');
      return;
    }
    setRunning(op);
    onBusyChange?.(true);
    const ok = await runOne(op);
    if (ok) {
      setLastCheckedAt(new Date().toISOString());
      showToast(t('success'), 'success');
    }
    setRunning(null);
    onBusyChange?.(false);
  };

  const runAll = async () => {
    if (!canWrite) {
      showToast(t('readOnly'), 'error');
      return;
    }
    setRunning('all');
    onBusyChange?.(true);
    let anyOk = false;
    for (const op of ALL_OPS) {
      setRunning(op);
      const ok = await runOne(op);
      if (ok) anyOk = true;
    }
    if (anyOk) {
      setLastCheckedAt(new Date().toISOString());
      showToast(t('diagnosis.allDone'), 'success');
    }
    setRunning(null);
    onBusyChange?.(false);
  };

  const identityView = useMemo(() => summarizeIdentity(cards.identity), [cards.identity]);
  const employerView = useMemo(() => {
    const dedicated = cards['employer-read'];
    const fromIdentity = asRecord(cards.identity?.employer);
    return summarizeEmployer(dedicated ?? fromIdentity);
  }, [cards]);
  const statusView = useMemo(() => summarizeStatus(cards.status), [cards.status]);

  const overallTone: HealthTone = useMemo(() => {
    const tones = [identityView.tone, employerView.tone, statusView.tone].filter((x) => x !== 'idle');
    if (Object.keys(opErrors).length > 0) return 'error';
    if (tones.length === 0) return 'idle';
    if (tones.includes('error')) return 'error';
    if (tones.includes('warn')) return 'warn';
    return 'ok';
  }, [identityView.tone, employerView.tone, statusView.tone, opErrors]);

  const isBusy = running !== null;
  const hasAny = Boolean(cards.identity || cards.status || cards['employer-read'] || Object.keys(opErrors).length);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{t('diagnosis.title')}</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">{t('diagnosis.hintFriendly')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <DiagButton
          label={t('diagnosis.runAll')}
          icon={<RefreshCw size={16} className={running === 'all' ? 'animate-spin' : ''} />}
          loading={running === 'all'}
          disabled={isBusy || !canWrite}
          primary
          onClick={() => void runAll()}
        />
        <DiagButton
          label={t('diagnosis.runStatus')}
          icon={<Activity size={16} />}
          loading={running === 'status'}
          disabled={isBusy || !canWrite}
          onClick={() => void run('status')}
        />
        <DiagButton
          label={t('diagnosis.runIdentity')}
          icon={<Cpu size={16} />}
          loading={running === 'identity'}
          disabled={isBusy || !canWrite}
          onClick={() => void run('identity')}
        />
        <DiagButton
          label={t('diagnosis.runEmployer')}
          icon={<Building2 size={16} />}
          loading={running === 'employer-read'}
          disabled={isBusy || !canWrite}
          onClick={() => void run('employer-read')}
        />
      </div>

      <OverallBanner
        tone={overallTone}
        title={t(`diagnosis.overall.${overallTone}.title`)}
        body={t(`diagnosis.overall.${overallTone}.body`)}
        checkedAt={lastCheckedAt}
        checkedLabel={t('diagnosis.lastChecked')}
      />

      {!hasAny ? (
        <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
          {t('diagnosis.emptyFriendly')}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <CheckCard
            title={t('diagnosis.connectivity')}
            tone={identityView.tone === 'idle' && opErrors.identity ? 'error' : identityView.tone}
            icon={<Cpu size={18} />}
          >
            {opErrors.identity && <ErrorLine text={opErrors.identity} />}
            {identityView.error && !opErrors.identity && <ErrorLine text={identityView.error} />}
            <Row label={t('diagnosis.serial')} value={identityView.serial} />
            <Row label={t('diagnosis.firmware')} value={identityView.firmware} />
            <Row label={t('diagnosis.mac')} value={identityView.mac} />
            {identityView.memory ? <Row label={t('diagnosis.memory')} value={identityView.memory} /> : null}
            {identityView.message ? <Row label={t('diagnosis.deviceMessage')} value={identityView.message} /> : null}
            {identityView.tone === 'idle' && !opErrors.identity ? (
              <p className="text-xs text-slate-400 pt-1">{t('diagnosis.notReadYet')}</p>
            ) : null}
          </CheckCard>

          <CheckCard
            title={t('diagnosis.employer')}
            tone={employerView.tone === 'idle' && opErrors['employer-read'] ? 'error' : employerView.tone}
            icon={<Building2 size={18} />}
          >
            {opErrors['employer-read'] && <ErrorLine text={opErrors['employer-read']} />}
            {employerView.error && !opErrors['employer-read'] && <ErrorLine text={employerView.error} />}
            <Row label={t('diagnosis.employerName')} value={employerView.name} />
            <Row
              label={t('diagnosis.employerDoc')}
              value={
                employerView.document
                  ? `${employerView.type ? `${employerView.type} ` : ''}${employerView.document}`
                  : undefined
              }
            />
            {employerView.cei ? <Row label={t('diagnosis.employerCei')} value={employerView.cei} /> : null}
            <Row label={t('diagnosis.employerAddress')} value={employerView.address} />
            {employerView.tone === 'idle' && !opErrors['employer-read'] ? (
              <p className="text-xs text-slate-400 pt-1">{t('diagnosis.notReadYet')}</p>
            ) : null}
          </CheckCard>

          <CheckCard
            title={t('diagnosis.operation')}
            tone={statusView.tone === 'idle' && opErrors.status ? 'error' : statusView.tone}
            icon={<Activity size={18} />}
          >
            {opErrors.status && <ErrorLine text={opErrors.status} />}
            {statusView.printPointError && <ErrorLine text={statusView.printPointError} />}
            {statusView.immediateError && <ErrorLine text={statusView.immediateError} />}
            <Row label={t('diagnosis.deviceId')} value={statusView.deviceId} />
            <Row label={t('diagnosis.capacity')} value={statusView.employeeCapacity} />
            <Row label={t('diagnosis.authMode')} value={statusView.authentication} />
            <div className="flex flex-wrap gap-2 pt-2">
              <FlagPill
                label={t('diagnosis.flagCard')}
                state={statusView.cardEnabled}
                yes={t('diagnosis.yes')}
                no={t('diagnosis.no')}
                unknown={t('diagnosis.unknown')}
              />
              <FlagPill
                label={t('diagnosis.flagKeyboard')}
                state={statusView.keyboardEnabled}
                yes={t('diagnosis.yes')}
                no={t('diagnosis.no')}
                unknown={t('diagnosis.unknown')}
              />
            </div>
            {statusView.tone === 'idle' && !opErrors.status ? (
              <p className="text-xs text-slate-400 pt-1">{t('diagnosis.notReadYet')}</p>
            ) : null}
          </CheckCard>
        </div>
      )}

      {hasAny && (
        <div className="rounded-xl border border-slate-100 bg-white">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl"
          >
            {showRaw ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {t('diagnosis.rawToggle')}
            <span className="text-xs font-medium text-slate-400 ml-auto">{t('diagnosis.rawHint')}</span>
          </button>
          {showRaw && (
            <pre className="text-xs text-slate-700 whitespace-pre-wrap break-all font-mono bg-slate-50 mx-3 mb-3 rounded-lg p-3 max-h-80 overflow-auto border border-slate-100">
              {JSON.stringify({ status: cards.status, identity: cards.identity, employer: cards['employer-read'], errors: opErrors }, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

function OverallBanner({
  tone,
  title,
  body,
  checkedAt,
  checkedLabel,
}: {
  tone: HealthTone;
  title: string;
  body: string;
  checkedAt: string | null;
  checkedLabel: string;
}) {
  const styles: Record<HealthTone, string> = {
    idle: 'border-slate-200 bg-slate-50 text-slate-800',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    warn: 'border-amber-200 bg-amber-50 text-amber-950',
    error: 'border-rose-200 bg-rose-50 text-rose-950',
  };
  const Icon =
    tone === 'ok' ? CheckCircle2 : tone === 'error' ? XCircle : tone === 'warn' ? AlertTriangle : HelpCircle;

  return (
    <div className={`rounded-2xl border px-4 py-3.5 flex gap-3 ${styles[tone]}`}>
      <Icon size={22} className="shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs leading-relaxed font-medium opacity-90">{body}</p>
        {checkedAt && (
          <p className="text-[11px] opacity-70">
            {checkedLabel}:{' '}
            {new Date(checkedAt).toLocaleString(undefined, {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        )}
      </div>
    </div>
  );
}

function CheckCard({
  title,
  tone,
  icon,
  children,
}: {
  title: string;
  tone: HealthTone;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const ring: Record<HealthTone, string> = {
    idle: 'border-slate-100',
    ok: 'border-emerald-100',
    warn: 'border-amber-100',
    error: 'border-rose-100',
  };
  const badge: Record<HealthTone, string> = {
    idle: 'bg-slate-100 text-slate-600',
    ok: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-900',
    error: 'bg-rose-100 text-rose-800',
  };
  const labelKey =
    tone === 'ok' ? 'diagnosis.toneOk' : tone === 'warn' ? 'diagnosis.toneWarn' : tone === 'error' ? 'diagnosis.toneError' : 'diagnosis.toneIdle';

  return (
    <section className={`rounded-2xl border bg-white p-5 space-y-3 ${ring[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="text-primary">{icon}</span>
          {title}
        </h3>
        <ToneBadge className={badge[tone]} labelKey={labelKey} />
      </div>
      {children}
    </section>
  );
}

function ToneBadge({ className, labelKey }: { className: string; labelKey: string }) {
  const { t } = useTranslation('timeClock');
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${className}`}>
      {t(labelKey)}
    </span>
  );
}

function FlagPill({
  label,
  state,
  yes,
  no,
  unknown,
}: {
  label: string;
  state: boolean | undefined;
  yes: string;
  no: string;
  unknown: string;
}) {
  const tone =
    state === true
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : state === false
        ? 'bg-rose-50 text-rose-800 border-rose-200'
        : 'bg-slate-50 text-slate-600 border-slate-200';
  const value = state === true ? yes : state === false ? no : unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${tone}`}>
      {label}: {value}
    </span>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5 break-words">
      {text}
    </p>
  );
}

function DiagButton({
  label,
  icon,
  loading,
  disabled,
  onClick,
  primary,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  const { t } = useTranslation('timeClock');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50 shadow-sm'
          : 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50'
      }
    >
      {icon}
      {loading ? t('running') : label}
    </button>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-50 py-2 last:border-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-800 break-words">{value?.trim() || '—'}</span>
    </div>
  );
}
