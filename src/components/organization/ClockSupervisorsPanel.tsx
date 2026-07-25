import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock3, Eraser, KeyRound, ListRestart, Pencil, Plus, Send, ShieldCheck, Trash2, UserRoundCheck, Wifi, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { hrService } from '../../services/hrService';
import type { ClockSupervisor, ClockSupervisorCommand, ClockSupervisorInput, Employee } from '../../types';

const emptyForm: ClockSupervisorInput = {
  code: '',
  pis: '',
  name: '',
  password: '',
  hasTechnicalPermission: true,
  hasDatetimePermission: true,
  hasPendrivePermission: true,
  hasBobbinPermission: false,
  isActive: true,
};

export function ClockSupervisorsPanel() {
  const { t } = useTranslation('org');
  const { showToast } = useToast();
  const [supervisors, setSupervisors] = useState<ClockSupervisor[]>([]);
  const [admins, setAdmins] = useState<Employee[]>([]);
  const [commands, setCommands] = useState<ClockSupervisorCommand[]>([]);
  const [form, setForm] = useState<ClockSupervisorInput>(emptyForm);
  const [editingId, setEditingId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [command, setCommand] = useState<'send' | 'clear'>();
  const [isCommandRunning, setIsCommandRunning] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const [overview, employees] = await Promise.all([
        hrService.getClockSupervisorOverview(),
        hrService.getEmployees(),
      ]);
      setSupervisors(overview.supervisors);
      setCommands(overview.commands);
      setAdmins(employees.filter((employee) => employee.role === 'ADMIN'));
    } catch (error) {
      console.error('[ClockSupervisors] load failed', error);
      showToast(t('clockSupervisors.loadFailed'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setEditingId(undefined);
    setForm(emptyForm);
  };

  const pickAdmin = (profileId: string) => {
    const admin = admins.find((item) => item.id === profileId);
    if (!admin) {
      setForm((current) => ({ ...current, profileId: null }));
      return;
    }
    const credential = String(admin.employeeId || '').replace(/\D/g, '');
    setForm((current) => ({
      ...current,
      profileId: admin.id,
      name: admin.name,
      code: credential,
      pis: credential.length === 12 ? credential : current.pis,
    }));
  };

  const edit = (supervisor: ClockSupervisor) => {
    setEditingId(supervisor.id);
    setForm({
      id: supervisor.id,
      profileId: supervisor.profileId,
      code: supervisor.code,
      pis: supervisor.pis,
      name: supervisor.name,
      password: '',
      hasTechnicalPermission: supervisor.hasTechnicalPermission,
      hasDatetimePermission: supervisor.hasDatetimePermission,
      hasPendrivePermission: supervisor.hasPendrivePermission,
      hasBobbinPermission: supervisor.hasBobbinPermission,
      isActive: supervisor.isActive,
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{1,20}$/.test(form.code)) {
      showToast(t('clockSupervisors.codeInvalid'), 'error');
      return;
    }
    if (!/^\d{12}$/.test(form.pis)) {
      showToast(t('clockSupervisors.pisInvalid'), 'error');
      return;
    }
    if (!editingId && !/^\d{6}$/.test(form.password ?? '')) {
      showToast(t('clockSupervisors.passwordInvalid'), 'error');
      return;
    }
    if (form.password && !/^\d{6}$/.test(form.password)) {
      showToast(t('clockSupervisors.passwordInvalid'), 'error');
      return;
    }
    const activeCount = supervisors.filter((item) => item.isActive && item.id !== editingId).length;
    if (form.isActive && activeCount >= 5) {
      showToast(t('clockSupervisors.limitReached'), 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        await hrService.updateClockSupervisor({ ...form, id: editingId });
      } else {
        await hrService.createClockSupervisor(form);
      }
      showToast(t(editingId ? 'clockSupervisors.updated' : 'clockSupervisors.created'), 'success');
      resetForm();
      await load();
    } catch (error) {
      console.error('[ClockSupervisors] save failed', error);
      showToast(
        error instanceof Error && error.message.includes('CLOCK_SUPERVISOR_LIMIT')
          ? t('clockSupervisors.limitReached')
          : t('clockSupervisors.saveFailed'),
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (supervisor: ClockSupervisor) => {
    if (!window.confirm(t('clockSupervisors.deleteConfirm', { name: supervisor.name }))) return;
    try {
      await hrService.deleteClockSupervisor(supervisor.id);
      setSupervisors((current) => current.filter((item) => item.id !== supervisor.id));
      showToast(t('clockSupervisors.deleted'), 'success');
      if (editingId === supervisor.id) resetForm();
    } catch (error) {
      console.error('[ClockSupervisors] delete failed', error);
      showToast(t('clockSupervisors.deleteFailed'), 'error');
    }
  };

  const runCommand = async () => {
    if (!command) return;
    setIsCommandRunning(true);
    try {
      const result = await hrService.triggerDmprepSync(
        command === 'send' ? 'send-masters' : 'clear-masters',
      );
      showToast(
        command === 'send'
          ? t('clockComm.sendSuccess', { count: result.masters?.supervisorCount ?? 0 })
          : t('clockComm.clearSuccess'),
        'success',
      );
      const overview = await hrService.getClockSupervisorOverview();
      setCommands(overview.commands);
      setCommand(undefined);
    } catch (error) {
      console.error('[ClockSupervisors] command failed', error);
      showToast(
        error instanceof Error && /already running|andamento|busy/i.test(error.message)
          ? t('clockComm.busy')
          : t(command === 'send' ? 'clockComm.sendFailed' : 'clockComm.clearFailed'),
        'error',
      );
    } finally {
      setIsCommandRunning(false);
    }
  };

  return (
    <section className="bg-white p-6 md:p-10 rounded-xl border border-slate-100 shadow-sm space-y-8 animate-in slide-in-from-bottom-8 duration-500">
      <header className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary">
          <ShieldCheck size={23} />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-slate-900">{t('clockSupervisors.title')}</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{t('clockSupervisors.description')}</p>
        </div>
      </header>

      <form onSubmit={save} className="space-y-6 border-t border-slate-100 pt-7">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            {editingId ? <Pencil size={16} /> : <Plus size={16} />}
            {t(editingId ? 'clockSupervisors.editTitle' : 'clockSupervisors.addTitle')}
          </h4>
          {editingId ? (
            <button type="button" onClick={resetForm} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
              <X size={14} /> {t('clockSupervisors.cancelEdit')}
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('clockSupervisors.pickAdmin')}</span>
            <select value={form.profileId ?? ''} onChange={(event) => pickAdmin(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-50">
              <option value="">{t('clockSupervisors.manualOption')}</option>
              {admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.name} · {admin.employeeId || '—'}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('clockSupervisors.name')}</span>
            <input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-50" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('clockSupervisors.code')}</span>
            <input required inputMode="numeric" pattern="[0-9]{1,20}" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.replace(/\D/g, '').slice(0, 20) }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-50" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('clockSupervisors.pis')}</span>
            <input required inputMode="numeric" pattern="[0-9]{12}" value={form.pis} onChange={(event) => setForm((current) => ({ ...current, pis: event.target.value.replace(/\D/g, '').slice(0, 12) }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-50" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('clockSupervisors.password')}</span>
            <input required={!editingId} type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" maxLength={6} value={form.password ?? ''} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder={editingId ? t('clockSupervisors.keepPassword') : '••••••'} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold tracking-[0.3em] outline-none focus:ring-4 focus:ring-blue-50" />
            <span className="block text-[10px] text-slate-400">{t('clockSupervisors.passwordHint')}</span>
          </label>
          <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            {t('clockSupervisors.active')}
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="h-5 w-5 accent-primary" />
          </label>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('clockSupervisors.permissions')}</legend>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {([
              ['hasTechnicalPermission', 'technical'],
              ['hasDatetimePermission', 'datetime'],
              ['hasPendrivePermission', 'pendrive'],
              ['hasBobbinPermission', 'bobbin'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))} className="accent-primary" />
                {t(`clockSupervisors.${label}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={isSaving || (!editingId && supervisors.filter((item) => item.isActive).length >= 5)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
          <UserRoundCheck size={17} />
          {isSaving ? t('saving') : t(editingId ? 'clockSupervisors.saveChanges' : 'clockSupervisors.add')}
        </button>
      </form>

      <div className="overflow-x-auto border-t border-slate-100 pt-7">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-slate-400">{t('clockSupervisors.loading')}</p>
        ) : supervisors.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">{t('clockSupervisors.empty')}</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-400">
              <tr>
                <th className="pb-3 font-semibold">{t('clockSupervisors.code')}</th>
                <th className="pb-3 font-semibold">{t('clockSupervisors.name')}</th>
                <th className="pb-3 font-semibold">{t('clockSupervisors.origin')}</th>
                <th className="pb-3 font-semibold">{t('clockSupervisors.password')}</th>
                <th className="pb-3 font-semibold">{t('clockSupervisors.status')}</th>
                <th className="pb-3 text-right font-semibold">{t('clockSupervisors.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {supervisors.map((supervisor) => (
                <tr key={supervisor.id}>
                  <td className="py-4 font-mono font-semibold text-slate-700">{supervisor.code}</td>
                  <td className="py-4 font-semibold text-slate-800">
                    {supervisor.name}
                    <span className="block text-[10px] font-normal text-slate-400">{supervisor.pis || '—'}</span>
                  </td>
                  <td className="py-4 text-xs text-slate-500">{t(supervisor.profileId ? 'clockSupervisors.adminOrigin' : 'clockSupervisors.manualOrigin')}</td>
                  <td className="py-4">
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-500"><KeyRound size={12} /> ••••••</span>
                  </td>
                  <td className="py-4 text-xs font-semibold text-slate-600">{t(supervisor.isActive ? 'clockSupervisors.activeStatus' : 'clockSupervisors.inactiveStatus')}</td>
                  <td className="py-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => edit(supervisor)} aria-label={t('clockSupervisors.edit')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-primary"><Pencil size={16} /></button>
                      <button type="button" onClick={() => void remove(supervisor)} aria-label={t('clockSupervisors.delete')} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="space-y-6 border-t border-slate-100 pt-8">
        <header className="flex items-start gap-3">
          <Wifi size={20} className="mt-0.5 text-primary" />
          <div>
            <h4 className="font-semibold text-slate-900">{t('clockComm.title')}</h4>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t('clockComm.description')}</p>
          </div>
        </header>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          {t('clockComm.sharedChannel')}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setCommand('send')}
            disabled={isCommandRunning || supervisors.filter((item) => item.isActive).length === 0}
            className="group flex min-h-32 items-start gap-4 rounded-xl border border-blue-200 bg-blue-50/60 p-5 text-left transition-colors hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-primary shadow-sm"><Send size={19} /></span>
            <span>
              <strong className="block text-sm text-slate-900">{t('clockComm.sendTitle')}</strong>
              <span className="mt-2 block text-xs leading-5 text-slate-500">{t('clockComm.sendDescription')}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCommand('clear')}
            disabled={isCommandRunning}
            className="group flex min-h-32 items-start gap-4 rounded-xl border border-red-200 bg-red-50/60 p-5 text-left transition-colors hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-red-600 shadow-sm"><Eraser size={19} /></span>
            <span>
              <strong className="block text-sm text-red-900">{t('clockComm.clearTitle')}</strong>
              <span className="mt-2 block text-xs leading-5 text-red-700/70">{t('clockComm.clearDescription')}</span>
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-slate-400">
            <Clock3 size={17} />
            <span className="text-xs font-semibold">{t('clockComm.dateTimeSoon')}</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-slate-400">
            <ListRestart size={17} />
            <span className="text-xs font-semibold">{t('clockComm.listsSoon')}</span>
          </div>
        </div>

        <p className="text-xs leading-5 text-slate-500">{t('clockComm.recoveryFlow')}</p>

        {commands.length > 0 ? (
          <div className="space-y-3 border-t border-slate-100 pt-5">
            <h5 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('clockComm.history')}</h5>
            <ul className="divide-y divide-slate-100">
              {commands.slice(0, 5).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                  <span className="font-semibold text-slate-700">
                    {t(item.action === 'SEND' ? 'clockComm.historySend' : 'clockComm.historyClear')}
                    {item.action === 'SEND' ? ` · ${item.supervisorCount}` : ''}
                  </span>
                  <span className={item.status === 'SUCCESS' ? 'text-emerald-700' : 'text-red-700'}>
                    {t(item.status === 'SUCCESS' ? 'clockComm.historySuccess' : 'clockComm.historyError')}
                    {' · '}
                    {new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.created))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {command ? (
        <div role="dialog" aria-modal="true" aria-labelledby="clock-command-title" className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="clock-command-title" className={`text-lg font-semibold ${command === 'clear' ? 'text-red-900' : 'text-slate-900'}`}>
                  {t(command === 'send' ? 'clockComm.sendConfirmTitle' : 'clockComm.clearConfirmTitle')}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {t(command === 'send' ? 'clockComm.sendConfirmText' : 'clockComm.clearConfirmText')}
                </p>
              </div>
              <button type="button" onClick={() => setCommand(undefined)} disabled={isCommandRunning} aria-label={t('clockComm.cancel')} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>

            {command === 'send' ? (
              <ul className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {supervisors.filter((item) => item.isActive).map((item) => (
                  <li key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="font-semibold text-slate-800">{item.name}</span>
                    <span className="font-mono text-xs text-slate-500">{item.code}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold leading-5 text-red-800">
                {t('clockComm.clearWarning')}
              </div>
            )}

            <div className="mt-7 flex justify-end gap-3">
              <button type="button" onClick={() => setCommand(undefined)} disabled={isCommandRunning} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {t('clockComm.cancel')}
              </button>
              <button type="button" onClick={() => void runCommand()} disabled={isCommandRunning} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${command === 'clear' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-hover'}`}>
                {command === 'clear' ? <Eraser size={16} /> : <Send size={16} />}
                {isCommandRunning ? t('clockComm.running') : t(command === 'send' ? 'clockComm.confirmSend' : 'clockComm.confirmClear')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
