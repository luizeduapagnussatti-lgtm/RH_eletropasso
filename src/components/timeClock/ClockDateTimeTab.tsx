import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock3, MessageSquare, Sun } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { runClockOp } from './clockCommandUi';

interface Props {
  onBusyChange?: (busy: boolean) => void;
}

export const ClockDateTimeTab: React.FC<Props> = ({ onBusyChange }) => {
  const { t } = useTranslation('timeClock');
  const { showToast } = useToast();
  const { canPerformAction } = useSubscription();
  const canWrite = canPerformAction('write');

  const [now, setNow] = useState(() => new Date());
  const [running, setRunning] = useState<string | null>(null);
  const [dstStart, setDstStart] = useState('');
  const [dstEnd, setDstEnd] = useState('');
  const [holidaysText, setHolidaysText] = useState('');
  const [displayLine, setDisplayLine] = useState(1);
  const [displayMessage, setDisplayMessage] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

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

  const loadOrgHolidays = async () => {
    try {
      const holidays = await hrService.getHolidays();
      const lines = holidays
        .map((h) => h.date)
        .filter(Boolean)
        .sort();
      setHolidaysText(lines.join('\n'));
    } catch (error) {
      console.error('[ClockDateTime] holidays load failed', error);
      showToast(t('failed'), 'error');
    }
  };

  const busy = running !== null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{t('datetime.title')}</h2>
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Clock3 size={16} className="text-primary" />
          {t('datetime.serverNow')}
        </h3>
        <p className="font-mono text-lg text-slate-900">{now.toISOString()}</p>
        <button
          type="button"
          disabled={busy || !canWrite}
          onClick={() =>
            void withRun('datetime', async () => {
              await runClockOp(
                () =>
                  hrService.runClockCommand('set-datetime', {
                    isoDateTime: new Date().toISOString(),
                  }),
                handlers(t('datetime.setDatetimeOk')),
              );
            })
          }
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-50"
        >
          {running === 'datetime' ? t('running') : t('datetime.setDatetime')}
        </button>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Sun size={16} className="text-primary" />
          {t('datetime.dstTitle')}
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('datetime.dstStart')} value={dstStart} onChange={setDstStart} placeholder="2026-10-18T00:00:00" />
          <Field label={t('datetime.dstEnd')} value={dstEnd} onChange={setDstEnd} placeholder="2027-02-15T00:00:00" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !canWrite || !dstStart || !dstEnd}
            onClick={() =>
              void withRun('dst', async () => {
                await runClockOp(
                  () =>
                    hrService.runClockCommand('set-dst', {
                      startIso: dstStart,
                      endIso: dstEnd,
                    }),
                  handlers(t('datetime.dstOk')),
                );
              })
            }
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold disabled:opacity-50"
          >
            {running === 'dst' ? t('running') : t('datetime.setDst')}
          </button>
          <button
            type="button"
            disabled={busy || !canWrite}
            onClick={() =>
              void withRun('remove-dst', async () => {
                await runClockOp(
                  () => hrService.runClockCommand('remove-dst'),
                  handlers(t('datetime.dstRemoved')),
                );
              })
            }
            className="px-4 py-2 rounded-xl border border-rose-200 text-rose-800 text-sm font-semibold disabled:opacity-50"
          >
            {running === 'remove-dst' ? t('running') : t('datetime.removeDst')}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <CalendarDays size={16} className="text-primary" />
          {t('datetime.holidaysTitle')}
        </h3>
        <p className="text-xs text-slate-500">{t('datetime.holidaysHint')}</p>
        <textarea
          className="w-full min-h-[8rem] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono"
          value={holidaysText}
          onChange={(e) => setHolidaysText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadOrgHolidays()}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold disabled:opacity-50"
          >
            {t('datetime.loadOrgHolidays')}
          </button>
          <button
            type="button"
            disabled={busy || !canWrite || !holidaysText.trim()}
            onClick={() =>
              void withRun('holidays', async () => {
                const dates = holidaysText
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean);
                await runClockOp(
                  () => hrService.runClockCommand('include-holidays', { dates }),
                  handlers(t('datetime.holidaysOk', { count: dates.length })),
                );
              })
            }
            className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
          >
            {running === 'holidays' ? t('running') : t('datetime.sendHolidays')}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <MessageSquare size={16} className="text-primary" />
          {t('datetime.displayTitle')}
        </h3>
        <div className="grid gap-3 md:grid-cols-[8rem_1fr]">
          <Field
            label={t('datetime.displayLine')}
            value={String(displayLine)}
            onChange={(v) => setDisplayLine(Number(v) || 1)}
            type="number"
          />
          <Field
            label={t('datetime.displayMessage')}
            value={displayMessage}
            onChange={setDisplayMessage}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !canWrite || !displayMessage.trim()}
            onClick={() =>
              void withRun('display', async () => {
                await runClockOp(
                  () =>
                    hrService.runClockCommand('send-display-message', {
                      line: displayLine,
                      message: displayMessage,
                    }),
                  handlers(t('datetime.displayOk')),
                );
              })
            }
            className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
          >
            {running === 'display' ? t('running') : t('datetime.sendDisplay')}
          </button>
          <button
            type="button"
            disabled={busy || !canWrite}
            onClick={() =>
              void withRun('clear-display', async () => {
                await runClockOp(
                  () => hrService.runClockCommand('clear-display-message'),
                  handlers(t('datetime.displayCleared')),
                );
              })
            }
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold disabled:opacity-50"
          >
            {running === 'clear-display' ? t('running') : t('datetime.clearDisplay')}
          </button>
        </div>
      </section>
    </div>
  );
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}
