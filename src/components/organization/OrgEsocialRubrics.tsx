import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet } from 'lucide-react';
import { EsocialRubricInternalType, EsocialRubricMapping } from '../../types';
import { esocialRubricService } from '../../services/esocialRubric.service';
import { useToast } from '../../context/ToastContext';

const TYPES: EsocialRubricInternalType[] = ['REGULAR', 'HE_50', 'HE_100', 'NIGHT', 'ABSENCE'];

export const OrgEsocialRubrics: React.FC = () => {
  const { t } = useTranslation('org');
  const { showToast } = useToast();
  const [rows, setRows] = useState<EsocialRubricMapping[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void esocialRubricService.list().then(setRows);
  }, []);

  const updateRow = (internalType: EsocialRubricInternalType, patch: Partial<EsocialRubricMapping>) => {
    setRows(prev =>
      prev.map(r => (r.internalType === internalType ? { ...r, ...patch } : r))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await esocialRubricService.saveAll(
        rows.map(r => ({
          internalType: r.internalType,
          rubricCode: r.rubricCode,
          description: r.description,
          active: r.active,
        }))
      );
      showToast(t('rubricsSaved'), 'success');
    } catch {
      showToast(t('rubricsSaveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white p-10 rounded-xl border border-slate-100 shadow-sm space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-3">
            <FileSpreadsheet size={24} className="text-primary" /> {t('esocialRubrics')}
          </h3>
          <p className="text-xs text-slate-400 mt-1">{t('esocialRubricsHint')}</p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-6 py-2 bg-primary text-white rounded-xl font-bold text-sm disabled:opacity-50"
        >
          {saving ? t('saving') : t('saveRubrics')}
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="text-left px-4 py-3">{t('rubricType')}</th>
              <th className="text-left px-4 py-3">{t('rubricCode')}</th>
              <th className="text-left px-4 py-3">{t('rubricDescription')}</th>
              <th className="text-left px-4 py-3">{t('rubricActive')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.internalType} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{r.internalType}</td>
                <td className="px-4 py-3">
                  <input
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm"
                    value={r.rubricCode}
                    onChange={e => updateRow(r.internalType, { rubricCode: e.target.value })}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                    value={r.description}
                    onChange={e => updateRow(r.internalType, { description: e.target.value })}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-primary"
                    checked={r.active}
                    onChange={e => updateRow(r.internalType, { active: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
