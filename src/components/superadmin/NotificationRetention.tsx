import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Bell, Clock, AlertTriangle, CheckCircle2, RefreshCw, Mail, MailOpen, Zap } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { organizationService } from '../../services/organization.service';

interface NotificationStats {
  totalNotifications: number;
  readNotifications: number;
  unreadNotifications: number;
  retentionDays: number;
  lastCleanup: {
    lastRun: string;
    recordsCleaned: number;
    errors: number;
    cutoffDate: string;
  } | null;
}

interface NotificationRetentionProps {
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void;
}

const RETENTION_OPTION_VALUES = [7, 14, 30, 60, 90] as const;

const NotificationRetention: React.FC<NotificationRetentionProps> = ({ onMessage }) => {
  const { t } = useTranslation('superadmin');
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const currentRetention = await organizationService.getSetting('notification_retention_days', 30) as number;
      setRetentionDays(currentRetention);

      const lastCleanup = await organizationService.getSetting('notification_cleanup_log', null) as NotificationStats['lastCleanup'] | null;

      let totalNotifications = 0;
      let readNotifications = 0;
      let unreadNotifications = 0;
      try {
        const { count: total } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true });
        totalNotifications = total || 0;

        const { count: read } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('is_read', true);
        readNotifications = read || 0;
        unreadNotifications = totalNotifications - readNotifications;
      } catch (e) {
        console.log('[NotificationRetention] Error fetching notification stats:', e);
      }

      setStats({
        totalNotifications,
        readNotifications,
        unreadNotifications,
        retentionDays: currentRetention,
        lastCleanup,
      });
    } catch (e) {
      console.error('[NotificationRetention] Load error:', e);
      onMessage({ type: 'error', text: t('notificationsPanel.errorLoad') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveRetention = async () => {
    setIsSaving(true);
    try {
      await organizationService.setSetting('notification_retention_days', retentionDays);
      onMessage({ type: 'success', text: t('notificationsPanel.successRetentionUpdated', { days: retentionDays }) });
      await loadStats();
    } catch (e: any) {
      console.error('[NotificationRetention] Save error:', e);
      onMessage({ type: 'error', text: t('notificationsPanel.errorSave') });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePurgeAll = async () => {
    if (!confirm(t('notificationsPanel.confirmPurge'))) {
      return;
    }

    setIsPurging(true);
    try {
      const { error, count } = await supabase
        .from('notifications')
        .delete({ count: 'exact' })
        .lt('created_at', new Date().toISOString());

      if (error) throw error;
      const deleted = count || 0;

      onMessage({ type: 'success', text: t('notificationsPanel.successPurge', { count: deleted }) });
      await loadStats();
    } catch (e: any) {
      console.error('[NotificationRetention] Purge error:', e);
      onMessage({ type: 'error', text: t('notificationsPanel.errorPurge', { message: e.message || t('storagePanel.errorUnknown') }) });
    } finally {
      setIsPurging(false);
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
          <h3 className="text-xl font-bold text-slate-900">{t('notificationsPanel.title')}</h3>
          <p className="text-sm text-slate-500 mt-1">{t('notificationsPanel.subtitle')}</p>
        </div>
        <button
          onClick={loadStats}
          disabled={isLoading}
          className="p-2 hover:bg-slate-100 rounded-xl transition-all"
        >
          <RefreshCw size={20} className={`text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl">
              <Bell size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{stats?.totalNotifications || 0}</p>
              <p className="text-xs text-slate-500 font-medium">{t('notificationsPanel.total')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <MailOpen size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{stats?.readNotifications || 0}</p>
              <p className="text-xs text-slate-500 font-medium">{t('notificationsPanel.read')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl">
              <Mail size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{stats?.unreadNotifications || 0}</p>
              <p className="text-xs text-slate-500 font-medium">{t('notificationsPanel.unread')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-xl">
              <Clock size={20} className="text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{t('notificationsPanel.retentionValue', { days: stats?.retentionDays || 30 })}</p>
              <p className="text-xs text-slate-500 font-medium">{t('notificationsPanel.retention')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Purge All Section */}
      <div className="bg-red-50 rounded-2xl border border-red-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-red-900">{t('notificationsPanel.purgeTitle')}</h4>
            <p className="text-sm text-red-700 mt-1">
              {t('notificationsPanel.purgeDesc')}
            </p>
          </div>
          <button
            onClick={handlePurgeAll}
            disabled={isPurging || (stats?.totalNotifications || 0) === 0}
            className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPurging ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
            {t('notificationsPanel.purgeButton', { count: stats?.totalNotifications || 0 })}
          </button>
        </div>
      </div>

      {/* Last Cleanup Info */}
      {stats?.lastCleanup && (
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 text-slate-600 mb-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <span className="font-bold text-sm">{t('notificationsPanel.lastCleanupTitle')}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-400 text-xs">{t('notificationsPanel.runTime')}</p>
              <p className="font-medium text-slate-700">
                {new Date(stats.lastCleanup.lastRun).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">{t('notificationsPanel.deleted')}</p>
              <p className="font-medium text-slate-700">{stats.lastCleanup.recordsCleaned}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">{t('notificationsPanel.errors')}</p>
              <p className={`font-medium ${stats.lastCleanup.errors > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {stats.lastCleanup.errors}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">{t('notificationsPanel.cutoffDate')}</p>
              <p className="font-medium text-slate-700">{stats.lastCleanup.cutoffDate}</p>
            </div>
          </div>
        </div>
      )}

      {/* Retention Settings */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h4 className="font-bold text-slate-900 mb-4">{t('notificationsPanel.policyTitle')}</h4>
        <p className="text-sm text-slate-500 mb-4">
          {t('notificationsPanel.policyDesc')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
          {RETENTION_OPTION_VALUES.map(value => (
            <button
              key={value}
              onClick={() => setRetentionDays(value)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                retentionDays === value
                  ? 'border-primary bg-primary-light/30'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className={`font-bold ${retentionDays === value ? 'text-primary' : 'text-slate-900'}`}>
                {t(`notificationsPanel.options.${value}.label`)}
              </p>
              <p className="text-xs text-slate-500 mt-1">{t(`notificationsPanel.options.${value}.desc`)}</p>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSaveRetention}
            disabled={isSaving || retentionDays === stats?.retentionDays}
            className="px-6 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            {t('notificationsPanel.savePolicy')}
          </button>
        </div>

        {/* Warning */}
        <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-800 text-sm">{t('notificationsPanel.notesTitle')}</p>
            <ul className="text-xs text-amber-700 mt-1 space-y-1">
              <li>{t('notificationsPanel.notes1')}</li>
              <li>{t('notificationsPanel.notes2')}</li>
              <li>{t('notificationsPanel.notes3')}</li>
              <li>{t('notificationsPanel.notes4')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationRetention;
