import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, CheckCircle2, ShieldAlert, User, Briefcase, Building } from 'lucide-react';
import { Role } from '../../types';

interface Props {
  role: Role;
}

type GuidelineRoleKey = 'employee' | 'manager' | 'management' | 'hr' | 'general';

const ROLE_CONFIG: Record<GuidelineRoleKey, { icon: React.FC<{ size?: number; className?: string }>; color: string }> = {
  employee: { icon: User, color: 'bg-primary-light text-primary' },
  manager: { icon: Briefcase, color: 'bg-primary-light text-primary' },
  management: { icon: ShieldAlert, color: 'bg-primary-light text-primary' },
  hr: { icon: Building, color: 'bg-emerald-50 text-emerald-600' },
  general: { icon: BookOpen, color: 'bg-slate-50 text-slate-600' },
};

function resolveGuidelineRole(role: Role): GuidelineRoleKey {
  switch (role) {
    case 'EMPLOYEE':
      return 'employee';
    case 'TEAM_LEAD':
    case 'MANAGER':
      return 'manager';
    case 'MANAGEMENT':
      return 'management';
    case 'HR':
    case 'ADMIN':
      return 'hr';
    default:
      return 'general';
  }
}

export const LeaveGuidelines: React.FC<Props> = ({ role }) => {
  const { t } = useTranslation('leave');
  const roleKey = resolveGuidelineRole(role);
  const config = ROLE_CONFIG[roleKey];
  const Icon = config.icon;
  const title = t(`guidelinesByRole.${roleKey}.title`);
  const rules = t(`guidelinesByRole.${roleKey}.rules`, { returnObjects: true }) as string[];

  return (
    <div className="bg-white rounded-xl p-6 md:p-8 border border-slate-100 shadow-sm mb-8 animate-in slide-in-from-top-4">
      <div className="flex items-center gap-4 mb-6">
        <div className={`p-3 rounded-2xl ${config.color}`}>
          <Icon size={24} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 uppercase tracking-tight">{title}</h3>
          <p className="text-xs font-bold text-slate-500">{t('reviewBeforeProceeding')}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map((rule, idx) => (
          <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
            <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs font-medium text-slate-700 leading-relaxed">{rule}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
