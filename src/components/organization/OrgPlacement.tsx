import React from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Building2, Trash2 } from 'lucide-react';
import { OfficeLocation } from '../../types';
import { OrgPanel, orgInteractive } from './OrgUi';

interface Props {
  locations: OfficeLocation[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

export const OrgPlacement: React.FC<Props> = ({ locations, onAdd, onEdit, onDelete }) => {
  const { t } = useTranslation('org');

  return (
    <OrgPanel
      icon={MapPin}
      title={t('officeGeofences')}
      countLabel={t('itemCount', { count: locations.length })}
      actionLabel={t('addItem')}
      onAction={onAdd}
    >
      <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {locations.map((loc, i) => (
          <div
            key={`${loc.name}-${i}`}
            className={`p-4 bg-slate-50 border border-slate-100 rounded-xl relative group ${orgInteractive}`}
          >
            <div className="flex justify-between items-start mb-2 gap-2">
              <h4 className="font-semibold text-slate-900 text-sm">{loc.name}</h4>
              <div className="flex gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onEdit(i)}
                  aria-label={t('editItem')}
                  className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-white/80 transition-colors"
                >
                  <Building2 size={14} aria-hidden />
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
            <p className="text-xs font-mono text-slate-500 tabular-nums">
              {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
            </p>
            <p className="text-xs font-medium text-primary mt-1.5">
              {t('radiusLabel', { radius: loc.radius })}
            </p>
          </div>
        ))}
        {locations.length === 0 && (
          <p className="col-span-full text-center text-slate-500 text-sm py-12">{t('noLocations')}</p>
        )}
      </div>
    </OrgPanel>
  );
};
