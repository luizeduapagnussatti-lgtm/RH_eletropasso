
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Network, Briefcase } from 'lucide-react';
import { OrgListRow, OrgPanel } from './OrgUi';

interface Props {
  departments: string[];
  designations: string[];
  onAdd: (type: 'DEPT' | 'DESIG') => void;
  onEdit: (type: 'DEPT' | 'DESIG', index: number) => void;
  onDelete: (type: 'DEPT' | 'DESIG', index: number) => void;
}

export const OrgStructure: React.FC<Props> = ({ departments, designations, onAdd, onEdit, onDelete }) => {
  const { t } = useTranslation('org');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <OrgPanel
        icon={Network}
        title={t('departments')}
        countLabel={t('itemCount', { count: departments.length })}
        actionLabel={t('addItem')}
        onAction={() => onAdd('DEPT')}
      >
        <div className="p-3 md:p-4 space-y-2 flex-1 overflow-y-auto max-h-[500px] no-scrollbar">
          {departments.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">{t('emptyDepartments')}</p>
          ) : (
            departments.map((dept, i) => (
              <OrgListRow
                key={`${dept}-${i}`}
                label={dept}
                onEdit={() => onEdit('DEPT', i)}
                onDelete={() => onDelete('DEPT', i)}
                editLabel={t('editItem')}
                deleteLabel={t('removeItem')}
              />
            ))
          )}
        </div>
      </OrgPanel>

      <OrgPanel
        icon={Briefcase}
        title={t('designations')}
        countLabel={t('itemCount', { count: designations.length })}
        actionLabel={t('addItem')}
        onAction={() => onAdd('DESIG')}
      >
        <div className="p-3 md:p-4 space-y-2 flex-1 overflow-y-auto max-h-[500px] no-scrollbar">
          {designations.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">{t('emptyDesignations')}</p>
          ) : (
            designations.map((des, i) => (
              <OrgListRow
                key={`${des}-${i}`}
                label={des}
                onEdit={() => onEdit('DESIG', i)}
                onDelete={() => onDelete('DESIG', i)}
                editLabel={t('editItem')}
                deleteLabel={t('removeItem')}
              />
            ))
          )}
        </div>
      </OrgPanel>
    </div>
  );
};
