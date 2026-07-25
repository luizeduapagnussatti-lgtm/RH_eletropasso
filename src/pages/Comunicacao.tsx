import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Radio,
  Settings2,
  ArrowRight,
  RefreshCw,
  Shield,
  Stethoscope,
  Users,
  Clock3,
  SlidersHorizontal,
  ScrollText,
} from 'lucide-react';
import HelpButton from '../components/onboarding/HelpButton';
import { ClockSyncTab } from '../components/timeClock/ClockSyncTab';
import { ClockSupervisorsTab } from '../components/timeClock/ClockSupervisorsTab';
import { ClockDiagnosisTab } from '../components/timeClock/ClockDiagnosisTab';
import { ClockEmployeesTab } from '../components/timeClock/ClockEmployeesTab';
import { ClockDateTimeTab } from '../components/timeClock/ClockDateTimeTab';
import { ClockSettingsTab } from '../components/timeClock/ClockSettingsTab';
import { ClockAuditTab } from '../components/timeClock/ClockAuditTab';
import { orgTabButtonClass } from '../components/organization/OrgUi';

interface Props {
  user: { id: string; role: string };
  onNavigate: (path: string, params?: any) => void;
}

type ClockTab =
  | 'sync'
  | 'supervisors'
  | 'diagnosis'
  | 'employees'
  | 'datetime'
  | 'settings'
  | 'audit';

const TABS: { id: ClockTab; labelKey: string; icon: typeof Radio }[] = [
  { id: 'sync', labelKey: 'tabs.sync', icon: RefreshCw },
  { id: 'supervisors', labelKey: 'tabs.supervisors', icon: Shield },
  { id: 'diagnosis', labelKey: 'tabs.diagnosis', icon: Stethoscope },
  { id: 'employees', labelKey: 'tabs.employees', icon: Users },
  { id: 'datetime', labelKey: 'tabs.datetime', icon: Clock3 },
  { id: 'settings', labelKey: 'tabs.settings', icon: SlidersHorizontal },
  { id: 'audit', labelKey: 'tabs.audit', icon: ScrollText },
];

const Comunicacao: React.FC<Props> = ({ user, onNavigate }) => {
  const { t } = useTranslation('timeClock');
  const canManage = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<ClockTab>('sync');
  const [commandBusy, setCommandBusy] = useState(false);

  if (!canManage) {
    return (
      <div className="p-6">
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          {t('onlyAdmin')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16">
      <div>
        <div className="flex items-center gap-2">
          <Radio size={22} className="text-primary" />
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <HelpButton topic="comunicacao.hub" />
        </div>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">{t('subtitle')}</p>
      </div>

      {commandBusy && (
        <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {t('busyBanner')}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto p-1 bg-slate-100/80 rounded-xl border border-slate-200/80">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={orgTabButtonClass(active)}
            >
              <Icon size={14} aria-hidden />
              {t(item.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="min-h-[12rem]">
        {tab === 'sync' && <ClockSyncTab onBusyChange={setCommandBusy} />}
        {tab === 'supervisors' && <ClockSupervisorsTab />}
        {tab === 'diagnosis' && <ClockDiagnosisTab onBusyChange={setCommandBusy} />}
        {tab === 'employees' && <ClockEmployeesTab onBusyChange={setCommandBusy} />}
        {tab === 'datetime' && <ClockDateTimeTab onBusyChange={setCommandBusy} />}
        {tab === 'settings' && <ClockSettingsTab onBusyChange={setCommandBusy} />}
        {tab === 'audit' && <ClockAuditTab />}
      </div>

      <button
        type="button"
        onClick={() => onNavigate('organization', { tab: 'SYSTEM' })}
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <Settings2 size={18} className="shrink-0 text-slate-500" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{t('orgShortcut.title')}</p>
          <p className="text-xs text-slate-500">{t('orgShortcut.desc')}</p>
        </div>
        <ArrowRight size={16} className="ml-auto shrink-0 text-slate-400" />
      </button>
    </div>
  );
};

export default Comunicacao;
