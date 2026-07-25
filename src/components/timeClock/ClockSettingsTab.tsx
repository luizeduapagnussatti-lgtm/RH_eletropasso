import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Fingerprint, Network, Radio, UserCog, Building2 } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { runClockOp } from './clockCommandUi';

interface Props {
  onBusyChange?: (busy: boolean) => void;
}

const CONFIRM_WORD = 'ALTERAR';

export const ClockSettingsTab: React.FC<Props> = ({ onBusyChange }) => {
  const { t } = useTranslation('timeClock');
  const { showToast } = useToast();
  const { canPerformAction } = useSubscription();
  const canWrite = canPerformAction('write');

  const [running, setRunning] = useState<string | null>(null);

  const [useReader, setUseReader] = useState(true);
  const [usePassword, setUsePassword] = useState(true);
  const [triggerType, setTriggerType] = useState('0');
  const [triggerValue, setTriggerValue] = useState('0');
  const [commUser, setCommUser] = useState('');
  const [commPassword, setCommPassword] = useState('');

  const [ip, setIp] = useState('');
  const [mask, setMask] = useState('');
  const [gateway, setGateway] = useState('');
  const [dns, setDns] = useState('');
  const [netConfirm, setNetConfirm] = useState('');

  const [employerType, setEmployerType] = useState('CNPJ');
  const [cnpj, setCnpj] = useState('');
  const [cei, setCei] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [address, setAddress] = useState('');
  const [extra, setExtra] = useState('');
  const [employerConfirm, setEmployerConfirm] = useState('');

  const busy = running !== null;
  const netUnlocked = netConfirm.trim().toUpperCase() === CONFIRM_WORD;
  const employerUnlocked = employerConfirm.trim().toUpperCase() === CONFIRM_WORD;

  const withRun = async (key: string, execute: () => Promise<void>) => {
    if (!canWrite) {
      showToast(t('readOnly'), 'error');
      return;
    }
    setRunning(key);
    onBusyChange?.(true);
    try {
      await execute();
    } finally {
      setRunning(null);
      onBusyChange?.(false);
    }
  };

  const handlers = (okMessage: string) => ({
    onBusy: () => showToast(t('busy'), 'warning'),
    onError: (message: string) => showToast(message || t('failed'), 'error'),
    onSuccess: () => showToast(okMessage, 'success'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{t('settings.title')}</h2>
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{t('settings.warning')}</p>
        </div>
      </div>

      <Section icon={<Fingerprint size={16} />} title={t('settings.biometricTitle')}>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={useReader} onChange={(e) => setUseReader(e.target.checked)} />
          {t('settings.useReader')}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} />
          {t('settings.usePassword')}
        </label>
        <Submit
          label={running === 'biometric' ? t('running') : t('settings.saveBiometric')}
          disabled={busy || !canWrite}
          onClick={() =>
            void withRun('biometric', async () => {
              await runClockOp(
                () =>
                  hrService.runClockCommand('program-biometric-reader-use', {
                    useReader,
                    usePassword,
                  }),
                handlers(t('settings.biometricOk')),
              );
            })
          }
        />
      </Section>

      <Section icon={<Radio size={16} />} title={t('settings.triggerTitle')}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('settings.triggerType')} value={triggerType} onChange={setTriggerType} />
          <Field label={t('settings.triggerValue')} value={triggerValue} onChange={setTriggerValue} />
        </div>
        <Submit
          label={running === 'trigger' ? t('running') : t('settings.saveTrigger')}
          disabled={busy || !canWrite}
          onClick={() =>
            void withRun('trigger', async () => {
              await runClockOp(
                () =>
                  hrService.runClockCommand('program-trigger-type', {
                    triggerType: Number(triggerType) || 0,
                    value: Number(triggerValue) || 0,
                  }),
                handlers(t('settings.triggerOk')),
              );
            })
          }
        />
      </Section>

      <Section icon={<UserCog size={16} />} title={t('settings.commUserTitle')}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('settings.commUser')} value={commUser} onChange={setCommUser} />
          <Field
            label={t('settings.commPassword')}
            value={commPassword}
            onChange={setCommPassword}
            type="password"
          />
        </div>
        <Submit
          label={running === 'comm' ? t('running') : t('settings.saveCommUser')}
          disabled={busy || !canWrite || !commUser || !commPassword}
          onClick={() =>
            void withRun('comm', async () => {
              await runClockOp(
                () =>
                  hrService.runClockCommand('update-communication-user', {
                    user: commUser,
                    password: commPassword,
                  }),
                handlers(t('settings.commUserOk')),
              );
            })
          }
        />
      </Section>

      <Section icon={<Network size={16} />} title={t('settings.netTitle')} danger>
        <p className="text-sm text-amber-900">{t('settings.netWarning')}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('settings.ip')} value={ip} onChange={setIp} />
          <Field label={t('settings.mask')} value={mask} onChange={setMask} />
          <Field label={t('settings.gateway')} value={gateway} onChange={setGateway} />
          <Field label={t('settings.dns')} value={dns} onChange={setDns} />
        </div>
        <ConfirmField
          hint={t('settings.confirmHint', { word: CONFIRM_WORD })}
          value={netConfirm}
          onChange={setNetConfirm}
        />
        <Submit
          label={running === 'net' ? t('running') : t('settings.saveNet')}
          disabled={busy || !canWrite || !netUnlocked || !ip || !mask || !gateway || !dns}
          danger
          onClick={() =>
            void withRun('net', async () => {
              await runClockOp(
                () =>
                  hrService.runClockCommand('set-net-info', { ip, mask, gateway, dns }),
                handlers(t('settings.netOk')),
              );
            })
          }
        />
      </Section>

      <Section icon={<Building2 size={16} />} title={t('settings.employerTitle')} danger>
        <p className="text-sm text-amber-900">{t('settings.employerWarning')}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('settings.employerType')} value={employerType} onChange={setEmployerType} />
          <Field label={t('settings.cnpj')} value={cnpj} onChange={setCnpj} />
          <Field label={t('settings.cei')} value={cei} onChange={setCei} />
          <Field label={t('settings.employerName')} value={employerName} onChange={setEmployerName} />
          <Field label={t('settings.address')} value={address} onChange={setAddress} />
          <Field label={t('settings.extra')} value={extra} onChange={setExtra} />
        </div>
        <ConfirmField
          hint={t('settings.confirmHint', { word: CONFIRM_WORD })}
          value={employerConfirm}
          onChange={setEmployerConfirm}
        />
        <Submit
          label={running === 'employer' ? t('running') : t('settings.saveEmployer')}
          disabled={
            busy ||
            !canWrite ||
            !employerUnlocked ||
            !employerType ||
            !cnpj ||
            !employerName ||
            !address
          }
          danger
          onClick={() =>
            void withRun('employer', async () => {
              await runClockOp(
                () =>
                  hrService.runClockCommand('change-employer', {
                    employerType,
                    cnpj,
                    cei,
                    name: employerName,
                    address,
                    ...(extra ? { extra } : {}),
                  }),
                handlers(t('settings.employerOk')),
              );
            })
          }
        />
      </Section>
    </div>
  );
};

function Section({
  icon,
  title,
  children,
  danger,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border bg-white p-5 space-y-3 ${
        danger ? 'border-amber-200' : 'border-slate-100'
      }`}
    >
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className={danger ? 'text-amber-700' : 'text-primary'}>{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

function ConfirmField({
  hint,
  value,
  onChange,
}: {
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-amber-800">{hint}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-sm font-mono uppercase outline-none focus:ring-2 focus:ring-amber-200"
      />
    </label>
  );
}

function Submit({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 ${
        danger
          ? 'bg-amber-600 text-white hover:bg-amber-700'
          : 'bg-primary text-white hover:bg-primary-hover'
      }`}
    >
      {label}
    </button>
  );
}
