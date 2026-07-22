import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus, Edit, Trash2, Save, X, RefreshCw, Eye, EyeOff, Share2,
  Youtube, Facebook, Instagram, Linkedin, Twitter, Github
} from 'lucide-react';
import { socialLinksService } from '../../services/sociallinks.service';
import { SocialLink } from '../../types';

interface SocialLinksManagementProps {
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void;
}

const PLATFORM_OPTIONS = [
  { value: 'youtube', icon: Youtube },
  { value: 'facebook', icon: Facebook },
  { value: 'instagram', icon: Instagram },
  { value: 'linkedin', icon: Linkedin },
  { value: 'x', icon: Twitter },
  { value: 'tiktok', icon: Share2 },
  { value: 'github', icon: Github },
];

const getPlatformIcon = (platform: string) => {
  const found = PLATFORM_OPTIONS.find(p => p.value === platform);
  return found ? found.icon : Share2;
};

const SocialLinksManagement: React.FC<SocialLinksManagementProps> = ({ onMessage }) => {
  const { t } = useTranslation('superadmin');

  const getPlatformLabel = (platform: string) => t(`socialLinks.platforms.${platform}`, platform);
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    platform: 'youtube',
    url: '',
    displayOrder: 0,
    isActive: true
  });

  const loadData = async () => {
    setIsLoading(true);
    const data = await socialLinksService.getAll();
    setLinks(data);
    setIsLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const resetForm = () => {
    setForm({ platform: 'youtube', url: '', displayOrder: links.length, isActive: true });
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setForm(prev => ({ ...prev, displayOrder: links.length }));
    setShowModal(true);
  };

  const openEdit = (link: SocialLink) => {
    setEditingId(link.id);
    setForm({
      platform: link.platform,
      url: link.url,
      displayOrder: link.displayOrder,
      isActive: link.isActive
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url.trim()) {
      onMessage({ type: 'error', text: t('socialLinks.validation.urlRequired') });
      return;
    }

    setIsSaving(true);
    let result;

    if (editingId) {
      result = await socialLinksService.update(editingId, {
        platform: form.platform,
        url: form.url,
        displayOrder: form.displayOrder,
        isActive: form.isActive
      });
    } else {
      result = await socialLinksService.create({
        platform: form.platform,
        url: form.url,
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

  const handleDelete = async (link: SocialLink) => {
    if (!confirm(t('socialLinks.deleteConfirm', { platform: getPlatformLabel(link.platform) }))) return;
    const result = await socialLinksService.delete(link.id);
    onMessage({ type: result.success ? 'success' : 'error', text: result.message });
    if (result.success) await loadData();
  };

  const handleToggleActive = async (link: SocialLink) => {
    const result = await socialLinksService.toggleActive(link.id, !link.isActive);
    onMessage({ type: result.success ? 'success' : 'error', text: result.message });
    if (result.success) await loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-slate-900">{t('socialLinks.listTitle')}</h3>
        <div className="flex gap-2">
          <button onClick={loadData} disabled={isLoading} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
            <RefreshCw size={20} className={`text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openAdd} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-primary-hover transition-all">
            <Plus size={18} /> {t('socialLinks.addLink')}
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">{t('socialLinks.loading')}</div>
      ) : links.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
          <Share2 size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">{t('socialLinks.emptyTitle')}</p>
          <p className="text-slate-400 text-sm mt-1">{t('socialLinks.emptyHint')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('socialLinks.table.platform')}</th>
                <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('socialLinks.table.url')}</th>
                <th className="text-center p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('socialLinks.table.order')}</th>
                <th className="text-center p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('socialLinks.table.active')}</th>
                <th className="text-right p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('socialLinks.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {links.map(link => {
                const Icon = getPlatformIcon(link.platform);
                return (
                  <tr key={link.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Icon size={20} className="text-slate-600" />
                        </div>
                        <span className="font-bold text-slate-900">{getPlatformLabel(link.platform)}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate block max-w-xs">
                        {link.url}
                      </a>
                    </td>
                    <td className="p-4 text-center text-sm font-bold text-slate-600">{link.displayOrder}</td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleToggleActive(link)}
                        className={`p-1.5 rounded-lg transition-all ${link.isActive ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                        title={link.isActive ? t('socialLinks.activeHide') : t('socialLinks.activeShow')}
                      >
                        {link.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(link)} className="p-2 hover:bg-amber-100 rounded-xl transition-all" title={t('socialLinks.actions.edit')}>
                          <Edit size={16} className="text-amber-600" />
                        </button>
                        <button onClick={() => handleDelete(link)} className="p-2 hover:bg-red-100 rounded-xl transition-all" title={t('socialLinks.actions.delete')}>
                          <Trash2 size={16} className="text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in">
            <div className="bg-primary p-6 flex justify-between items-center text-white">
              <h3 className="text-sm font-semibold uppercase tracking-widest">
                {editingId ? t('socialLinks.modal.editTitle') : t('socialLinks.modal.addTitle')}
              </h3>
              <button onClick={() => { setShowModal(false); resetForm(); }}><X size={24} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-5">
              {/* Platform */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">{t('socialLinks.form.platform')}</label>
                <select
                  required
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-4 focus:ring-primary-light transition-all"
                  value={form.platform}
                  onChange={e => setForm({ ...form, platform: e.target.value })}
                >
                  {PLATFORM_OPTIONS.map(p => (
                    <option key={p.value} value={p.value}>{t(`socialLinks.platforms.${p.value}`)}</option>
                  ))}
                </select>
              </div>

              {/* URL */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">{t('socialLinks.form.url')}</label>
                <input
                  required
                  type="url"
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-4 focus:ring-primary-light transition-all"
                  placeholder={t('socialLinks.form.urlPlaceholder')}
                  value={form.url}
                  onChange={e => setForm({ ...form, url: e.target.value })}
                />
              </div>

              {/* Order & Active */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">{t('socialLinks.form.displayOrder')}</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    value={form.displayOrder}
                    onChange={e => setForm({ ...form, displayOrder: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">{t('socialLinks.form.visibility')}</label>
                  <label className="flex items-center gap-3 px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={e => setForm({ ...form, isActive: e.target.checked })}
                      className="w-4 h-4 accent-emerald-500"
                    />
                    <span className="text-sm font-bold text-slate-600">{form.isActive ? t('socialLinks.form.visible') : t('socialLinks.form.hidden')}</span>
                  </label>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-50">
                <button type="button" disabled={isSaving} onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 py-4 bg-slate-100 rounded-2xl font-semibold uppercase text-[10px] tracking-widest hover:bg-slate-200">{t('socialLinks.form.cancel')}</button>
                <button type="submit" disabled={isSaving} className="flex-1 py-4 bg-primary text-white rounded-2xl font-semibold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 shadow-lg hover:bg-primary-hover">
                  {isSaving ? <RefreshCw className="animate-spin" size={16} /> : <><Save size={16} /> {editingId ? t('socialLinks.form.update') : t('socialLinks.form.add')}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialLinksManagement;
