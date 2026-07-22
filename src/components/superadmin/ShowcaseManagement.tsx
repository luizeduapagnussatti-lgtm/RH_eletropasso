import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus, Edit, Trash2, Save, X, Upload, RefreshCw, Eye, EyeOff, Building2
} from 'lucide-react';
import { showcaseService } from '../../services/showcase.service';
import { ShowcaseOrganization } from '../../types';

interface ShowcaseManagementProps {
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void;
}

const INDUSTRY_OPTIONS: { value: string; key: string }[] = [
  { value: 'Technology', key: 'technology' },
  { value: 'Manufacturing', key: 'manufacturing' },
  { value: 'Healthcare', key: 'healthcare' },
  { value: 'Education', key: 'education' },
  { value: 'Finance', key: 'finance' },
  { value: 'Retail', key: 'retail' },
  { value: 'Construction', key: 'construction' },
  { value: 'Logistics', key: 'logistics' },
  { value: 'Consulting', key: 'consulting' },
  { value: 'Non-Profit', key: 'nonProfit' },
  { value: 'Other', key: 'other' },
];

const ShowcaseManagement: React.FC<ShowcaseManagementProps> = ({ onMessage }) => {
  const { t } = useTranslation('superadmin');
  const [orgs, setOrgs] = useState<ShowcaseOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '',
    country: '',
    industry: '',
    websiteUrl: '',
    tagline: '',
    displayOrder: 0,
    isActive: true
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');

  const loadData = async () => {
    setIsLoading(true);
    const data = await showcaseService.getAll();
    setOrgs(data);
    setIsLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const resetForm = () => {
    setForm({ name: '', country: '', industry: '', websiteUrl: '', tagline: '', displayOrder: orgs.length, isActive: true });
    setLogoFile(null);
    setLogoPreview('');
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setForm(prev => ({ ...prev, displayOrder: orgs.length }));
    setShowModal(true);
  };

  const openEdit = (org: ShowcaseOrganization) => {
    setEditingId(org.id);
    setForm({
      name: org.name,
      country: org.country || '',
      industry: org.industry || '',
      websiteUrl: org.websiteUrl || '',
      tagline: org.tagline || '',
      displayOrder: org.displayOrder,
      isActive: org.isActive
    });
    setLogoPreview(org.logo || '');
    setLogoFile(null);
    setShowModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      onMessage({ type: 'error', text: t('showcase.validation.nameRequired') });
      return;
    }
    if (!editingId && !logoFile) {
      onMessage({ type: 'error', text: t('showcase.validation.logoRequired') });
      return;
    }

    setIsSaving(true);
    let result;

    if (editingId) {
      result = await showcaseService.update(editingId, {
        name: form.name,
        logo: logoFile || undefined,
        country: form.country,
        industry: form.industry,
        websiteUrl: form.websiteUrl,
        tagline: form.tagline,
        displayOrder: form.displayOrder,
        isActive: form.isActive
      });
    } else {
      result = await showcaseService.create({
        name: form.name,
        logo: logoFile || undefined,
        country: form.country,
        industry: form.industry,
        websiteUrl: form.websiteUrl,
        tagline: form.tagline,
        displayOrder: form.displayOrder,
        isActive: form.isActive
      });
    }

    setIsSaving(false);
    onMessage({ type: result.success ? 'success' : 'error', text: result.message });

    if (result.success) {
      setShowModal(false);
      resetForm();
      await loadData();
    }
  };

  const handleDelete = async (org: ShowcaseOrganization) => {
    if (!confirm(t('showcase.deleteConfirm', { name: org.name }))) return;
    const result = await showcaseService.delete(org.id);
    onMessage({ type: result.success ? 'success' : 'error', text: result.message });
    if (result.success) await loadData();
  };

  const handleToggleActive = async (org: ShowcaseOrganization) => {
    const result = await showcaseService.toggleActive(org.id, !org.isActive);
    onMessage({ type: result.success ? 'success' : 'error', text: result.message });
    if (result.success) await loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-slate-900">{t('showcase.listTitle')}</h3>
        <div className="flex gap-2">
          <button onClick={loadData} disabled={isLoading} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
            <RefreshCw size={20} className={`text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openAdd} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-primary-hover transition-all">
            <Plus size={18} /> {t('showcase.addOrganization')}
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">{t('showcase.loading')}</div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
          <Building2 size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">{t('showcase.emptyTitle')}</p>
          <p className="text-slate-400 text-sm mt-1">{t('showcase.emptyHint')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('showcase.table.organization')}</th>
                <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('showcase.table.country')}</th>
                <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('showcase.table.industry')}</th>
                <th className="text-center p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('showcase.table.order')}</th>
                <th className="text-center p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('showcase.table.active')}</th>
                <th className="text-right p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('showcase.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgs.map(org => (
                <tr key={org.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {org.logo ? (
                        <img src={org.logo} alt={org.name} className="w-10 h-10 rounded-lg object-contain bg-slate-50 border border-slate-100 p-1" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-300">
                          {org.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-slate-900">{org.name}</p>
                        {org.tagline && <p className="text-xs text-slate-400">{org.tagline}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-600">{org.country || '-'}</td>
                  <td className="p-4 text-sm text-slate-600">{org.industry || '-'}</td>
                  <td className="p-4 text-center text-sm font-bold text-slate-600">{org.displayOrder}</td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => handleToggleActive(org)}
                      className={`p-1.5 rounded-lg transition-all ${org.isActive ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                      title={org.isActive ? t('showcase.activeHide') : t('showcase.activeShow')}
                    >
                      {org.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(org)} className="p-2 hover:bg-amber-100 rounded-xl transition-all" title={t('showcase.actions.edit')}>
                        <Edit size={16} className="text-amber-600" />
                      </button>
                      <button onClick={() => handleDelete(org)} className="p-2 hover:bg-red-100 rounded-xl transition-all" title={t('showcase.actions.delete')}>
                        <Trash2 size={16} className="text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in">
            <div className="bg-primary p-6 flex justify-between items-center text-white">
              <h3 className="text-sm font-semibold uppercase tracking-widest">
                {editingId ? t('showcase.modal.editTitle') : t('showcase.modal.addTitle')}
              </h3>
              <button onClick={() => { setShowModal(false); resetForm(); }}><X size={24} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-5 max-h-[80vh] overflow-y-auto no-scrollbar">
              {/* Logo Upload */}
              <div className="flex items-center gap-6">
                <div
                  className="w-24 h-24 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-primary transition-all overflow-hidden flex-shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt={t('showcase.modal.logoPreviewAlt')} className="w-full h-full object-contain p-2" />
                  ) : (
                    <Upload size={24} className="text-slate-300" />
                  )}
                  <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleFileChange} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-700">{t('showcase.modal.logoLabel')}</p>
                  <p className="text-xs text-slate-400 mt-1">{t('showcase.modal.logoHint')}</p>
                  {!editingId && <p className="text-xs text-red-400 mt-1">{t('showcase.modal.logoRequired')}</p>}
                </div>
              </div>

              {/* Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">{t('showcase.form.name')}</label>
                <input required className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-4 focus:ring-primary-light transition-all" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>

              {/* Country & Industry */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">{t('showcase.form.country')}</label>
                  <input className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" placeholder={t('showcase.form.countryPlaceholder')} value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">{t('showcase.form.industry')}</label>
                  <select className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })}>
                    <option value="">{t('showcase.form.selectIndustry')}</option>
                    {INDUSTRY_OPTIONS.map(i => <option key={i.value} value={i.value}>{t(`showcase.industries.${i.key}`)}</option>)}
                  </select>
                </div>
              </div>

              {/* Website & Tagline */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">{t('showcase.form.websiteUrl')}</label>
                <input type="url" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" placeholder={t('showcase.form.websitePlaceholder')} value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">{t('showcase.form.tagline')}</label>
                <input className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" placeholder={t('showcase.form.taglinePlaceholder')} value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} />
              </div>

              {/* Order & Active */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">{t('showcase.form.displayOrder')}</label>
                  <input type="number" min="0" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={form.displayOrder} onChange={e => setForm({ ...form, displayOrder: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">{t('showcase.form.visibility')}</label>
                  <label className="flex items-center gap-3 px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                    <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 accent-emerald-500" />
                    <span className="text-sm font-bold text-slate-600">{form.isActive ? t('showcase.form.visibleOnLanding') : t('showcase.form.hidden')}</span>
                  </label>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-50">
                <button type="button" disabled={isSaving} onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 py-4 bg-slate-100 rounded-2xl font-semibold uppercase text-[10px] tracking-widest hover:bg-slate-200">{t('showcase.form.cancel')}</button>
                <button type="submit" disabled={isSaving} className="flex-1 py-4 bg-primary text-white rounded-2xl font-semibold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 shadow-lg hover:bg-primary-hover">
                  {isSaving ? <RefreshCw className="animate-spin" size={16} /> : <><Save size={16} /> {editingId ? t('showcase.form.update') : t('showcase.form.add')}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShowcaseManagement;
