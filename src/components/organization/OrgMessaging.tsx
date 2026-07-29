import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, MessageCircle, Loader2, Save } from 'lucide-react';
import { OrgMessagingConfig } from '../../types';
import { messagingService } from '../../services/messaging.service';
import { useToast } from '../../context/ToastContext';

interface Props {
  config: OrgMessagingConfig;
  onSave: (config: OrgMessagingConfig) => Promise<void>;
}

export const OrgMessaging: React.FC<Props> = ({ config, onSave }) => {
  const { t } = useTranslation('org');
  const { showToast } = useToast();
  const [local, setLocal] = useState<OrgMessagingConfig>(config);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<{ connected: boolean; resendConfigured: boolean } | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => { setLocal(config); }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(local);
      showToast(t('messagingSaved'), 'success');
    } catch {
      showToast(t('messagingSaveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const checkHealth = async () => {
    setChecking(true);
    try {
      const h = await messagingService.checkHealth();
      setHealth(h);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <MessageCircle size={18} className="text-primary" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">{t('messagingChannelsTitle')}</h3>
            <p className="text-[10px] text-slate-400 font-medium">{t('messagingChannelsHint')}</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <label className="flex items-center gap-3 p-4 rounded-xl border cursor-pointer">
            <input type="checkbox" checked={local.emailEnabled} onChange={e => setLocal(p => ({ ...p, emailEnabled: e.target.checked }))} className="w-4 h-4 accent-primary" />
            <Mail size={16} className="text-slate-500" />
            <span className="text-sm font-semibold">{t('messagingEmailEnabled')}</span>
          </label>
          <label className="flex items-center gap-3 p-4 rounded-xl border cursor-pointer">
            <input type="checkbox" checked={local.whatsappEnabled} onChange={e => setLocal(p => ({ ...p, whatsappEnabled: e.target.checked }))} className="w-4 h-4 accent-primary" />
            <MessageCircle size={16} className="text-slate-500" />
            <span className="text-sm font-semibold">{t('messagingWhatsappEnabled')}</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase">{t('messagingFromEmail')}</span>
              <input value={local.fromEmail} onChange={e => setLocal(p => ({ ...p, fromEmail: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase">{t('messagingWhatsappFrom')}</span>
              <input value={local.whatsappFrom} onChange={e => setLocal(p => ({ ...p, whatsappFrom: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
            </label>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-600 mb-3">{t('messagingThrottleTitle')}</h4>
            <p className="text-[10px] text-slate-400 mb-3">{t('messagingThrottleHint')}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">{t('messagingWhatsappDelay')}</span>
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={local.whatsappDelaySeconds ?? 4}
                  onChange={e => setLocal(p => ({ ...p, whatsappDelaySeconds: Number(e.target.value) || 4 }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">{t('messagingEmailDelay')}</span>
                <input
                  type="number"
                  min={200}
                  max={5000}
                  step={100}
                  value={local.emailDelayMs ?? 800}
                  onChange={e => setLocal(p => ({ ...p, emailDelayMs: Number(e.target.value) || 800 }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">{t('messagingMaxWhatsappBatch')}</span>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={local.maxWhatsappPerBatch ?? 25}
                  onChange={e => setLocal(p => ({ ...p, maxWhatsappPerBatch: Number(e.target.value) || 25 }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">{t('messagingPauseEvery')}</span>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={local.batchPauseEvery ?? 10}
                  onChange={e => setLocal(p => ({ ...p, batchPauseEvery: Number(e.target.value) || 10 }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">{t('messagingPauseSeconds')}</span>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={local.batchPauseSeconds ?? 15}
                  onChange={e => setLocal(p => ({ ...p, batchPauseSeconds: Number(e.target.value) || 15 }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void checkHealth()} disabled={checking} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200">
              {checking ? <Loader2 size={14} className="animate-spin" /> : null}
              {t('messagingHealthCheck')}
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-xl text-xs font-semibold">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {t('saveMessagingSettings')}
            </button>
          </div>
          {health && (
            <p className="text-xs text-slate-500">
              WhatsApp: {health.connected ? t('messagingConnected') : t('messagingDisconnected')} · Resend: {health.resendConfigured ? t('messagingConfigured') : t('messagingNotConfigured')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrgMessaging;
