import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Fingerprint, RefreshCw, Send, Trash2, UserMinus } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../context/ToastContext';
import { useSubscription } from '../../context/SubscriptionContext';
import type { ClockEmployeeOnDevice, Employee } from '../../types';
import { extractCommandData, runClockOp } from './clockCommandUi';
import { isNonPunchingStaff, needsClockAdmission } from '../../utils/roles';
import { normalizePis, toWatchCommSendEmployee } from '../../utils/employeeCredentials';

type DiffKind = 'both' | 'onlyClock' | 'onlyRh';
type FilterKind = 'all' | DiffKind | 'fingerprint';

interface DiffRow {
  key: string;
  pis: string;
  name: string;
  kind: DiffKind;
  /** RH-confirmed biometric (preferred) or device fingerprint list when available. */
  hasFingerprint: boolean;
  /** true when status comes from RH flag, not device inventory */
  bioFromRh: boolean;
  rh?: Employee;
  clock?: ClockEmployeeOnDevice;
}

interface Props {
  onBusyChange?: (busy: boolean) => void;
}

function pickPisFromUnknown(item: Record<string, unknown>): string {
  return normalizePis(
    String(
      item.pis ??
        item.Pis ??
        item.PIS ??
        item.employeePis ??
        item.EmployeePis ??
        '',
    ),
  );
}

function pickNameFromUnknown(item: Record<string, unknown>): string {
  return String(item.name ?? item.Name ?? item.Nome ?? item.nome ?? '');
}

export const ClockEmployeesTab: React.FC<Props> = ({ onBusyChange }) => {
  const { t } = useTranslation('timeClock');
  const { showToast } = useToast();
  const { canPerformAction } = useSubscription();
  const canWrite = canPerformAction('write');

  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [rows, setRows] = useState<DiffRow[]>([]);
  const [filter, setFilter] = useState<FilterKind>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | {
    kind: 'send' | 'remove' | 'excludeFp' | 'orphans';
    message: string;
  }>(null);
  const [fpUnsupported, setFpUnsupported] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filter === 'all') return true;
      if (filter === 'fingerprint') return row.hasFingerprint;
      return row.kind === filter;
    });
  }, [rows, filter]);

  const load = async () => {
    if (!canWrite) {
      showToast(t('readOnly'), 'error');
      return;
    }
    setLoading(true);
    onBusyChange?.(true);
    try {
      const [empResult, fpResult, rhEmployees] = await Promise.all([
        hrService.runClockCommand('employee-list-read'),
        hrService.runClockCommand('fingerprint-list-read').catch((err) => {
          console.warn('[ClockEmployees] fingerprint-list-read failed', err);
          return null;
        }),
        hrService.getEmployees(),
      ]);

      if (empResult.busy) {
        showToast(t('busy'), 'warning');
        return;
      }

      const empData = extractCommandData(empResult);
      if (empData.supported === false) {
        showToast(String(empData.error || t('employees.listReadFailed')), 'error');
        return;
      }
      const rawEmployees = Array.isArray(empData.employees) ? empData.employees : [];
      const clockEmployees: ClockEmployeeOnDevice[] = rawEmployees.map((item) => {
        const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return {
          pis: pickPisFromUnknown(obj),
          name: pickNameFromUnknown(obj),
          code: String(obj.code ?? obj.Code ?? ''),
        };
      }).filter((e) => e.pis);

      const fpPis = new Set<string>();
      let unsupported = false;
      if (fpResult && !fpResult.busy) {
        const fpData = extractCommandData(fpResult);
        if (fpData.supported === false) unsupported = true;
        const fingerprints = Array.isArray(fpData.fingerprints) ? fpData.fingerprints : [];
        for (const fp of fingerprints) {
          const obj = (fp && typeof fp === 'object' ? fp : {}) as Record<string, unknown>;
          const pis = pickPisFromUnknown(obj);
          if (pis) fpPis.add(pis);
        }
      }
      setFpUnsupported(unsupported);

      const clockByPis = new Map(clockEmployees.map((e) => [e.pis, e]));
      const rhByPis = new Map<string, Employee>();
      for (const emp of rhEmployees) {
        if (isNonPunchingStaff(emp.role) || emp.role === 'SUPER_ADMIN' || !needsClockAdmission(emp)) {
          continue;
        }
        const pis = normalizePis(emp.employeeId);
        if (pis) rhByPis.set(pis, emp);
      }

      const allPis = new Set([...clockByPis.keys(), ...rhByPis.keys()]);
      const next: DiffRow[] = [];
      for (const pis of allPis) {
        const clock = clockByPis.get(pis);
        const rh = rhByPis.get(pis);
        let kind: DiffKind = 'both';
        if (clock && !rh) kind = 'onlyClock';
        else if (!clock && rh) kind = 'onlyRh';
        next.push({
          key: pis,
          pis,
          name: clock?.name || rh?.name || '',
          kind,
          hasFingerprint: rh
            ? !!rh.clockBiometricRegistered
            : fpPis.has(pis),
          bioFromRh: !!rh,
          rh,
          clock,
        });
      }
      next.sort((a, b) => a.name.localeCompare(b.name) || a.pis.localeCompare(b.pis));
      setRows(next);
      setSelected(new Set());
      showToast(t('success'), 'success');
    } catch (error) {
      console.error('[ClockEmployees] load failed', error);
      const message = error instanceof Error ? error.message : t('failed');
      showToast(/already running|andamento|busy/i.test(message) ? t('busy') : message, 'error');
    } finally {
      setLoading(false);
      onBusyChange?.(false);
    }
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedRows = () => rows.filter((r) => selected.has(r.key));

  const ask = (kind: NonNullable<typeof confirm>['kind']) => {
    if (kind !== 'orphans' && selected.size === 0) {
      showToast(t('employees.selectOne'), 'warning');
      return;
    }
    const messages: Record<typeof kind, string> = {
      send: t('employees.confirmSend'),
      remove: t('employees.confirmRemove'),
      excludeFp: t('employees.confirmExcludeFp'),
      orphans: t('employees.confirmExcludeOrphans'),
    };
    setConfirm({ kind, message: messages[kind] });
  };

  const executeConfirm = async () => {
    if (!confirm) return;
    if (!canWrite) {
      showToast(t('readOnly'), 'error');
      return;
    }
    const kind = confirm.kind;
    setConfirm(null);
    setBusyAction(kind);
    onBusyChange?.(true);

    const handlers = {
      onBusy: () => showToast(t('busy'), 'warning'),
      onError: (message: string) => showToast(message || t('failed'), 'error'),
      onSuccess: () => undefined as void,
    };

    try {
      if (kind === 'send') {
        const payload = {
          employees: selectedRows()
            .filter((r) => r.rh)
            .map((r) =>
              toWatchCommSendEmployee({
                name: r.rh!.name,
                employeeId: r.rh!.employeeId,
                clockCredential: r.rh!.clockCredential,
              }),
            )
            .filter((row): row is NonNullable<typeof row> => row !== null),
        };
        if (payload.employees.length === 0) {
          showToast(t('employees.selectOne'), 'warning');
          return;
        }
        await runClockOp(() => hrService.runClockCommand('send-employees', payload), {
          ...handlers,
          onSuccess: () => showToast(t('employees.sendOk', { count: payload.employees.length }), 'success'),
        });
        await Promise.all(
          selectedRows()
            .filter((r) => r.rh && (r.rh.clockOnboardingStatus === 'PENDING_EXPORT' || r.rh.clockOnboardingStatus === 'ERROR'))
            .map((r) =>
              hrService.updateProfile(r.rh!.id, {
                clockOnboardingStatus: 'PENDING_BIO',
                clockOnboardingAt: new Date().toISOString(),
              }).catch((err) => {
                console.warn('[ClockEmployees] onboarding status update failed', err);
              }),
            ),
        );
      } else if (kind === 'remove') {
        for (const row of selectedRows()) {
          const ok = await runClockOp(
            () => hrService.runClockCommand('remove-employee', { pis: row.pis }),
            {
              ...handlers,
              onSuccess: () => showToast(t('employees.removeOk'), 'success'),
            },
          );
          if (!ok) break;
        }
      } else if (kind === 'excludeFp') {
        for (const row of selectedRows()) {
          const ok = await runClockOp(
            () => hrService.runClockCommand('exclude-fingerprint', { pis: row.pis }),
            {
              ...handlers,
              onSuccess: () => showToast(t('employees.excludeFpOk'), 'success'),
            },
          );
          if (!ok) break;
        }
      } else if (kind === 'orphans') {
        await runClockOp(() => hrService.runClockCommand('exclude-fingerprint-orphans'), {
          ...handlers,
          onSuccess: () => showToast(t('employees.excludeOrphansOk'), 'success'),
        });
      }
      await load();
    } finally {
      setBusyAction(null);
      onBusyChange?.(false);
    }
  };

  const kindLabel = (kind: DiffKind) => {
    if (kind === 'both') return t('employees.both');
    if (kind === 'onlyClock') return t('employees.onlyClock');
    return t('employees.onlyRh');
  };

  const actionBusy = loading || busyAction !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('employees.title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('employees.hint')}</p>
          {fpUnsupported && (
            <p className="text-xs text-amber-700 mt-1">{t('employees.fingerprintUnsupported')}</p>
          )}
          <p className="text-xs text-slate-500 mt-1">{t('employees.bioRhSourceHint')}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={actionBusy || !canWrite}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? t('employees.loading') : t('employees.load')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'employees.filterAll'],
            ['both', 'employees.filterBoth'],
            ['onlyClock', 'employees.filterOnlyClock'],
            ['onlyRh', 'employees.filterOnlyRh'],
            ['fingerprint', 'employees.filterFingerprint'],
          ] as const
        ).map(([id, key]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              filter === id
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <ActionBtn
          icon={<Send size={14} />}
          label={t('employees.sendSelected')}
          disabled={actionBusy || !canWrite}
          onClick={() => ask('send')}
        />
        <ActionBtn
          icon={<UserMinus size={14} />}
          label={t('employees.removeSelected')}
          danger
          disabled={actionBusy || !canWrite}
          onClick={() => ask('remove')}
        />
        <ActionBtn
          icon={<Fingerprint size={14} />}
          label={t('employees.excludeFingerprint')}
          danger
          disabled={actionBusy || !canWrite}
          onClick={() => ask('excludeFp')}
        />
        <ActionBtn
          icon={<Trash2 size={14} />}
          label={t('employees.excludeOrphans')}
          danger
          disabled={actionBusy || !canWrite}
          onClick={() => ask('orphans')}
        />
        {selected.size > 0 && (
          <span className="self-center text-xs text-slate-500">
            {t('employees.selected', { count: selected.size })}
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">{t('employees.empty')}</p>
        ) : (
          <div className="overflow-x-auto max-h-[28rem]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-400 sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-10" />
                  <th className="px-3 py-2">{t('employees.pis')}</th>
                  <th className="px-3 py-2">{t('employees.name')}</th>
                  <th className="px-3 py-2">{t('employees.source')}</th>
                  <th className="px-3 py-2">{t('employees.withFingerprint')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.key} className="border-t border-slate-50 hover:bg-slate-50/80">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(row.key)}
                        onChange={() => toggle(row.key)}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.pis}</td>
                    <td className="px-3 py-2 text-slate-800">{row.name || '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                          row.kind === 'both'
                            ? 'bg-emerald-50 text-emerald-800'
                            : row.kind === 'onlyClock'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-sky-50 text-sky-800'
                        }`}
                      >
                        {kindLabel(row.kind)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {row.hasFingerprint
                        ? t(row.bioFromRh ? 'employees.bioOkRh' : 'employees.withFingerprint')
                        : t(row.bioFromRh ? 'employees.bioPendingRh' : 'employees.noFingerprint')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <p className="text-sm text-slate-700 leading-relaxed">{confirm.message}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => void executeConfirm()}
                className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
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
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border disabled:opacity-50 ${
        danger
          ? 'border-rose-200 text-rose-800 bg-rose-50 hover:bg-rose-100'
          : 'border-slate-200 text-slate-800 bg-white hover:bg-slate-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
