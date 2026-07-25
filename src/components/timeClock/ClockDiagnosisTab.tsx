import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Building2, Cpu, Fingerprint } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import { useSubscription } from '../../context/SubscriptionContext';
import type { ClockCommandOp } from '../../types';
import { digCommandValue, extractCommandData, runClockOp } from './clockCommandUi';

interface Props {
  onBusyChange?: (busy: boolean) => void;
}

type DiagnosisKind = 'status' | 'identity' | 'employer-read';

export const ClockDiagnosisTab: React.FC<Props> = ({ onBusyChange }) => {
  const { t } = useTranslation('timeClock');
  const { showToast } = useToast();
  const { canPerformAction } = useSubscription();
  const canWrite = canPerformAction('write');

  const [running, setRunning] = useState<DiagnosisKind | null>(null);
  const [cards, setCards] = useState<Partial<Record<DiagnosisKind, Record<string, unknown>>>>({});

  const run = async (op: DiagnosisKind) => {
    if (!canWrite) {
      showToast(t('readOnly'), 'error');
      return;
    }
    setRunning(op);
    onBusyChange?.(true);
    await runClockOp(() => hrService.runClockCommand(op as ClockCommandOp), {
      onBusy: () => showToast(t('busy'), 'warning'),
      onSuccess: (result) => {
        setCards((prev) => ({ ...prev, [op]: extractCommandData(result) }));
        showToast(t('success'), 'success');
      },
      onError: (message) => showToast(message || t('failed'), 'error'),
    });
    setRunning(null);
    onBusyChange?.(false);
  };

  const identity = cards.identity;
  const status = cards.status;
  const employer = cards['employer-read'];

  const serial =
    digCommandValue(identity, ['serial', 'Serial', 'serialNumber', 'serialAndMemory']) ||
    digCommandValue(status, ['serial', 'Serial', 'serialNumber', 'serialAndMemory']);
  const firmware =
    digCommandValue(identity, ['firmware', 'Firmware', 'firmwareVersion']) ||
    digCommandValue(status, ['firmware', 'Firmware', 'firmwareVersion']);
  const mac =
    digCommandValue(identity, ['mac', 'MAC', 'Mac']) ||
    digCommandValue(status, ['mac', 'MAC', 'Mac']);

  const isBusy = running !== null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{t('diagnosis.title')}</h2>
        <p className="text-sm text-slate-500 mt-1">{t('diagnosis.hint')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
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

      {!identity && !status && !employer ? (
        <p className="text-sm text-slate-500">{t('diagnosis.empty')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard title={t('diagnosis.identity')} icon={<Fingerprint size={18} />}>
            <Row label={t('diagnosis.serial')} value={serial} />
            <Row label={t('diagnosis.firmware')} value={firmware} />
            <Row label={t('diagnosis.mac')} value={mac} />
          </InfoCard>
          <InfoCard title={t('diagnosis.employer')} icon={<Building2 size={18} />}>
            {employer ? (
              <pre className="text-xs text-slate-700 whitespace-pre-wrap break-all font-mono bg-slate-50 rounded-lg p-3 max-h-64 overflow-auto">
                {JSON.stringify(employer, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
          </InfoCard>
          {(status || identity) && (
            <InfoCard title={t('diagnosis.raw')} icon={<Activity size={18} />} className="md:col-span-2">
              <pre className="text-xs text-slate-700 whitespace-pre-wrap break-all font-mono bg-slate-50 rounded-lg p-3 max-h-72 overflow-auto">
                {JSON.stringify({ status, identity }, null, 2)}
              </pre>
            </InfoCard>
          )}
        </div>
      )}
    </div>
  );
};

function DiagButton({
  label,
  icon,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
    >
      {icon}
      {loading ? '…' : label}
    </button>
  );
}

function InfoCard({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-100 bg-white p-5 space-y-3 ${className}`}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className="text-primary">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-50 py-2 last:border-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-800 break-all">{value || '—'}</span>
    </div>
  );
}
