import React from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Edit3, Trash2, UserCheck } from 'lucide-react';
import { Team, Employee } from '../../types';
import { OrgPanel, orgInteractive } from './OrgUi';

interface Props {
  teams: Team[];
  employees: Employee[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

export const OrgTeams: React.FC<Props> = ({ teams, employees, onAdd, onEdit, onDelete }) => {
  const { t } = useTranslation('org');

  return (
    <OrgPanel
      icon={Users}
      title={t('managementTeams')}
      countLabel={t('itemCount', { count: teams.length })}
      actionLabel={t('createTeam')}
      onAction={onAdd}
    >
      <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {teams.map((team, i) => {
          const memberCount = employees.filter(e => e.teamId === team.id).length;
          const leadName = employees.find(e => e.id === team.leaderId)?.name;
          return (
            <div
              key={team.id}
              className={`p-4 bg-slate-50 border border-slate-100 rounded-xl group relative ${orgInteractive}`}
            >
              <div className="flex justify-between items-start mb-3 gap-2">
                <span className="px-2 py-0.5 bg-primary-light text-primary rounded-md text-xs font-semibold">
                  {team.department || t('general')}
                </span>
                <div className="flex gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEdit(i)}
                    aria-label={t('editItem')}
                    className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-white/80 transition-colors"
                  >
                    <Edit3 size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(i)}
                    aria-label={t('removeItem')}
                    className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              </div>
              <h4 className="font-semibold text-slate-900 text-base mb-1">{team.name}</h4>
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-2">
                <UserCheck size={14} className="text-primary shrink-0" aria-hidden />
                {leadName ? t('lead', { name: leadName }) : t('noLeadAssigned')}
              </p>
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Users size={14} className="shrink-0" aria-hidden />
                {t('assignedMembers', { count: memberCount })}
              </p>
            </div>
          );
        })}
        {teams.length === 0 && (
          <div className="col-span-full py-16 text-center">
            <p className="text-slate-500 text-sm font-medium">{t('noTeams')}</p>
          </div>
        )}
      </div>
    </OrgPanel>
  );
};
