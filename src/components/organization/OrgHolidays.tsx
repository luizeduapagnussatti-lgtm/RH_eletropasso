import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Plus, Clock, Trash2, Download, Loader2 } from 'lucide-react';
import { Holiday } from '../../types';
import { getBrRsHolidaysForYear, mergeHolidaysByDate } from '../../data/brRsHolidayCalendar';

interface Props {
  holidays: Holiday[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onImportMerged: (merged: Holiday[]) => Promise<void>;
}

export const OrgHolidays: React.FC<Props> = ({
  holidays, onAdd, onEdit, onDelete, onImportMerged,
}) => {
  const { t } = useTranslation('org');
  const currentYear = new Date().getFullYear();
  const [importYear, setImportYear] = useState(currentYear);
  const [includeFacultative, setIncludeFacultative] = useState(true);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    try {
      const incoming = getBrRsHolidaysForYear(importYear, {
        includeCommonFacultative: includeFacultative,
      });
      const { merged, added, skipped } = mergeHolidaysByDate(holidays, incoming);
      if (added === 0) {
        window.alert(t('holidayImportNone', { year: importYear, skipped }));
        return;
      }
      const ok = window.confirm(
        t('holidayImportConfirm', { year: importYear, added, skipped })
      );
      if (!ok) return;
      await onImportMerged(merged);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4 animate-in zoom-in duration-500">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between bg-slate-50/80">
          <div>
            <p className="text-xs font-semibold text-slate-800">{t('holidayImportTitle')}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{t('holidayImportHint')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
              value={importYear}
              onChange={(e) => setImportYear(parseInt(e.target.value, 10))}
            >
              {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={includeFacultative}
                onChange={(e) => setIncludeFacultative(e.target.checked)}
                className="w-3.5 h-3.5 accent-primary"
              />
              <span className="text-[10px] font-semibold text-slate-600">{t('holidayImportFacultative')}</span>
            </label>
            <button
              type="button"
              disabled={importing}
              onClick={handleImport}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {t('holidayImportAction')}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 bg-primary text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Calendar size={20} />
            <h3 className="text-sm font-semibold uppercase tracking-wider">{t('holidayCalendar')}</h3>
          </div>
          <button onClick={onAdd} className="p-2 bg-white/10 rounded-lg hover:bg-white/20">
            <Plus size={18} />
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h, i) => {
            const sortedIndex = holidays.findIndex((x) => x.id === h.id && x.date === h.date);
            const editIndex = sortedIndex >= 0 ? sortedIndex : i;
            return (
            <div
              key={h.id || `${h.date}-${i}`}
              className="p-5 bg-slate-50 border border-slate-100 rounded-[2rem] flex justify-between items-start group hover:bg-white transition-all"
            >
              <div>
                <p className="text-[10px] font-semibold text-rose-500 uppercase tracking-widest mb-1">{h.date}</p>
                <h4 className="font-bold text-slate-900">{h.name}</h4>
                <span className="text-[9px] font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-md mt-2 inline-block">
                  {t(`holidayTypes.${h.type}`, { defaultValue: h.type })}
                </span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onEdit(editIndex)} className="p-1.5 text-slate-400 hover:text-primary">
                  <Clock size={14} />
                </button>
                <button onClick={() => onDelete(editIndex)} className="p-1.5 text-slate-400 hover:text-rose-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            );
          })}
          {holidays.length === 0 && (
            <p className="col-span-full text-center text-slate-400 py-10 font-bold uppercase text-xs">
              {t('noHolidays')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
