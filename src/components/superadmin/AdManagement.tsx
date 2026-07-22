import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X, Code, Image, Globe } from 'lucide-react';
import { organizationService } from '../../services/organization.service';
import { AdConfig, AdSlot, AdPlaceholder } from '../ads';

const AD_SLOTS: { id: AdSlot; size: string }[] = [
  { id: 'sidebar', size: '300x250' },
  { id: 'dashboard', size: '728x90' },
  { id: 'reports', size: '300x250' },
  { id: 'footer', size: '728x90' },
  { id: 'landing-hero', size: '728x90' },
  { id: 'landing-mid', size: '728x90' },
  { id: 'blog-header', size: '728x90' },
  { id: 'blog-feed', size: '728x90' },
  { id: 'blog-post-top', size: '728x90' },
  { id: 'blog-post-content', size: '300x250' }
];

const DEFAULT_CONFIG: Omit<AdConfig, 'id' | 'slot'> = {
  enabled: false,
  adType: 'image',
  adsenseClient: '',
  adsenseSlot: '',
  customHtml: '',
  imageUrl: '',
  linkUrl: '',
  altText: ''
};

interface AdManagementProps {
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void;
}

const AdManagement: React.FC<AdManagementProps> = ({ onMessage }) => {
  const { t } = useTranslation('superadmin');
  const [configs, setConfigs] = useState<Record<AdSlot, AdConfig>>({} as Record<AdSlot, AdConfig>);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingSlot, setEditingSlot] = useState<AdSlot | null>(null);
  const [editForm, setEditForm] = useState<AdConfig | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setIsLoading(true);
    try {
      const loadedConfigs: Record<AdSlot, AdConfig> = {} as Record<AdSlot, AdConfig>;
      for (const slot of AD_SLOTS) {
        const value = await organizationService.getSetting(`ad_config_${slot.id}`, null);
        if (value) {
          loadedConfigs[slot.id] = { ...(value as AdConfig), slot: slot.id };
        } else {
          loadedConfigs[slot.id] = { id: '', slot: slot.id, ...DEFAULT_CONFIG };
        }
      }
      setConfigs(loadedConfigs);
    } catch (e) {
      console.error('[AdManagement] Load error:', e);
      onMessage({ type: 'error', text: t('ads.loadError') });
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = (slot: AdSlot) => {
    setEditingSlot(slot);
    setEditForm({ ...configs[slot] });
  };

  const closeEditModal = () => {
    setEditingSlot(null);
    setEditForm(null);
  };

  const handleSave = async () => {
    if (!editingSlot || !editForm) return;
    setIsSaving(true);
    try {
      await organizationService.setSetting(`ad_config_${editingSlot}`, editForm);
      setConfigs(prev => ({ ...prev, [editingSlot]: editForm }));
      onMessage({ type: 'success', text: t('ads.saveSuccess', { slot: editingSlot }) });
      closeEditModal();
    } catch (e: any) {
      console.error('[AdManagement] Save error:', e);
      onMessage({ type: 'error', text: e?.message || t('ads.saveError') });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleEnabled = async (slot: AdSlot) => {
    const config = configs[slot];
    const updated = { ...config, enabled: !config.enabled };
    setConfigs(prev => ({ ...prev, [slot]: updated }));
    try {
      await organizationService.setSetting(`ad_config_${slot}`, updated);
      onMessage({
        type: 'success',
        text: t(updated.enabled ? 'ads.toggleEnabled' : 'ads.toggleDisabled', { slot }),
      });
    } catch (e: any) {
      console.error('[AdManagement] Toggle error:', e);
      setConfigs(prev => ({ ...prev, [slot]: config }));
      onMessage({ type: 'error', text: t('ads.toggleError') });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900">{t('ads.title')}</h3>
          <p className="text-sm text-slate-500 mt-1">{t('ads.subtitle')}</p>
        </div>
      </div>

      {/* Ad Slots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {AD_SLOTS.map(slot => {
          const config = configs[slot.id];
          return (
            <div
              key={slot.id}
              className={`bg-white rounded-2xl border p-6 ${config?.enabled ? 'border-emerald-200' : 'border-slate-200'}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="font-bold text-slate-900">{t(`ads.slots.${slot.id}.name`)}</h4>
                  <p className="text-xs text-slate-500">{t(`ads.slots.${slot.id}.description`)}</p>
                  <p className="text-xs text-slate-400 mt-1">{t('ads.size', { size: slot.size })}</p>
                </div>
                <button
                  onClick={() => toggleEnabled(slot.id)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    config?.enabled
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {config?.enabled ? t('ads.enabled') : t('ads.disabled')}
                </button>
              </div>

              {config?.enabled && (
                <div className="mb-4 p-3 bg-slate-50 rounded-lg text-xs">
                  <span className="font-medium text-slate-600">{t('ads.type')} </span>
                  <span className="text-slate-800 capitalize">{t(`ads.adTypes.${config.adType}`)}</span>
                  {config.adType === 'adsense' && config.adsenseSlot && (
                    <span className="text-slate-500 ml-2">{t('ads.adsenseSlot', { slot: config.adsenseSlot })}</span>
                  )}
                  {config.adType === 'image' && config.imageUrl && (
                    <span className="text-slate-500 ml-2">{t('ads.imageConfigured')}</span>
                  )}
                </div>
              )}

              <button
                onClick={() => openEditModal(slot.id)}
                className="w-full py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
              >
                {t('ads.configure')}
              </button>
            </div>
          );
        })}
      </div>

      {/* Preview Section */}
      <div className="bg-slate-50 rounded-2xl p-6">
        <h4 className="font-bold text-slate-700 mb-4">{t('ads.previewTitle')}</h4>
        <div className="grid grid-cols-4 gap-4 items-start">
          <div className="col-span-1 space-y-2">
            <div className="text-xs font-bold text-slate-500 uppercase">{t('ads.previewSidebar')}</div>
            <AdPlaceholder slot="sidebar" />
          </div>
          <div className="col-span-3 space-y-4">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase mb-2">{t('ads.previewDashboard')}</div>
              <AdPlaceholder slot="dashboard" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase mb-2">{t('ads.previewFooter')}</div>
              <AdPlaceholder slot="footer" />
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingSlot && editForm && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900">{t('ads.configureModalTitle', { slot: editingSlot })}</h3>
              <button onClick={closeEditModal} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Ad Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">{t('ads.adType')}</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setEditForm({ ...editForm, adType: 'image' })}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${
                      editForm.adType === 'image' ? 'border-primary bg-primary-light' : 'border-slate-200'
                    }`}
                  >
                    <Image size={20} />
                    <span className="text-xs font-medium">{t('ads.adTypes.image')}</span>
                  </button>
                  <button
                    onClick={() => setEditForm({ ...editForm, adType: 'adsense' })}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${
                      editForm.adType === 'adsense' ? 'border-primary bg-primary-light' : 'border-slate-200'
                    }`}
                  >
                    <Globe size={20} />
                    <span className="text-xs font-medium">{t('ads.adTypes.adsense')}</span>
                  </button>
                  <button
                    onClick={() => setEditForm({ ...editForm, adType: 'custom' })}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${
                      editForm.adType === 'custom' ? 'border-primary bg-primary-light' : 'border-slate-200'
                    }`}
                  >
                    <Code size={20} />
                    <span className="text-xs font-medium">{t('ads.adTypes.custom')}</span>
                  </button>
                </div>
              </div>

              {/* Image Ad Fields */}
              {editForm.adType === 'image' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-600">{t('ads.imageUrl')}</label>
                    <input
                      type="url"
                      value={editForm.imageUrl || ''}
                      onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })}
                      placeholder={t('ads.imageUrlPlaceholder')}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-light outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-600">{t('ads.linkUrl')}</label>
                    <input
                      type="url"
                      value={editForm.linkUrl || ''}
                      onChange={(e) => setEditForm({ ...editForm, linkUrl: e.target.value })}
                      placeholder={t('ads.linkUrlPlaceholder')}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-light outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-600">{t('ads.altText')}</label>
                    <input
                      type="text"
                      value={editForm.altText || ''}
                      onChange={(e) => setEditForm({ ...editForm, altText: e.target.value })}
                      placeholder={t('ads.altTextPlaceholder')}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-light outline-none"
                    />
                  </div>
                </>
              )}

              {/* AdSense Fields */}
              {editForm.adType === 'adsense' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-600">{t('ads.adsenseClientId')}</label>
                    <input
                      type="text"
                      value={editForm.adsenseClient || ''}
                      onChange={(e) => setEditForm({ ...editForm, adsenseClient: e.target.value })}
                      placeholder={t('ads.adsenseClientPlaceholder')}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-light outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-600">{t('ads.adsenseSlotId')}</label>
                    <input
                      type="text"
                      value={editForm.adsenseSlot || ''}
                      onChange={(e) => setEditForm({ ...editForm, adsenseSlot: e.target.value })}
                      placeholder={t('ads.adsenseSlotPlaceholder')}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-light outline-none"
                    />
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
                    {t('ads.adsenseScriptNote')}
                  </div>
                </>
              )}

              {/* Custom HTML Fields */}
              {editForm.adType === 'custom' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">{t('ads.customHtml')}</label>
                  <textarea
                    value={editForm.customHtml || ''}
                    onChange={(e) => setEditForm({ ...editForm, customHtml: e.target.value })}
                    placeholder={t('ads.customHtmlPlaceholder')}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-light outline-none font-mono text-sm"
                    rows={6}
                  />
                  <div className="p-3 bg-red-50 rounded-lg text-xs text-red-700">
                    {t('ads.customHtmlWarning')}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={closeEditModal}
                className="flex-1 py-3 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition-all"
              >
                {t('ads.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving && <Loader2 size={18} className="animate-spin" />}
                {t('ads.saveConfiguration')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdManagement;
