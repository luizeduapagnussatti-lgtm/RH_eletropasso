import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, HardDrive, Trash2, Clock, AlertTriangle, CheckCircle2, RefreshCw, Camera } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { organizationService } from '../../services/organization.service';

interface StorageStats {
  totalAttendanceRecords: number;
  recordsWithSelfies: number;
  estimatedStorageMB: number;
  retentionDays: number;
  lastCleanup: {
    lastRun: string;
    recordsCleaned: number;
    errors: number;
    cutoffDate: string;
  } | null;
}

interface StorageManagementProps {
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void;
}

const RETENTION_OPTION_VALUES = [7, 14, 30, 60, 90] as const;

const StorageManagement: React.FC<StorageManagementProps> = ({ onMessage }) => {
  const { t } = useTranslation('superadmin');
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const currentRetention = await organizationService.getSetting('selfie_retention_days', 30) as number;
      setRetentionDays(currentRetention);

      const lastCleanup = await organizationService.getSetting('selfie_cleanup_log', null) as StorageStats['lastCleanup'] | null;

      // Count attendance records
      let totalRecords = 0;
      let recordsWithSelfies = 0;
      try {
        const { count: total } = await supabase
          .from('attendance')
          .select('*', { count: 'exact', head: true });
        totalRecords = total || 0;

        const { count: withSelfies } = await supabase
          .from('attendance')
          .select('*', { count: 'exact', head: true })
          .not('selfie', 'is', null);
        recordsWithSelfies = withSelfies || 0;
      } catch (e) {
        console.log('[Storage] Error counting records:', e);
      }

      const estimatedStorageMB = Math.round((recordsWithSelfies * 150) / 1024);

      setStats({
        totalAttendanceRecords: totalRecords,
        recordsWithSelfies,
        estimatedStorageMB,
        retentionDays: currentRetention,
        lastCleanup,
      });
    } catch (e) {
      console.error('[Storage] Load error:', e);
      onMessage({ type: 'error', text: t('storagePanel.errorLoad') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveRetention = async () => {
    setIsSaving(true);
    try {
      await organizationService.setSetting('selfie_retention_days', retentionDays);
      onMessage({ type: 'success', text: t('storagePanel.successRetentionUpdated', { days: retentionDays }) });
      await loadStats();
    } catch (e: any) {
      console.error('[Storage] Save error:', e);
      onMessage({ type: 'error', text: t('storagePanel.errorSave') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualCleanup = async () => {
    if (!confirm(t('storagePanel.confirmCleanup', { days: retentionDays }))) {
      return;
    }

    setIsRunningCleanup(true);
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      // Fetch records with selfies older than retention period
      const { data: records, error: fetchError } = await supabase
        .from('attendance')
        .select('id')
        .lt('date', cutoffStr)
        .not('selfie', 'is', null);

      if (fetchError) throw fetchError;

      let cleaned = 0;
      let errors = 0;

      if (records && records.length > 0) {
        for (const record of records) {
          try {
            const { error } = await supabase
              .from('attendance')
              .update({ selfie: null })
              .eq('id', record.id);
            if (error) throw error;
            cleaned++;
          } catch (e) {
            errors++;
          }
        }
      }

      onMessage({
        type: 'success',
        text: errors > 0
          ? t('storagePanel.successCleanupWithErrors', { cleaned, errors })
          : t('storagePanel.successCleanup', { cleaned }),
      });
      await loadStats();
    } catch (e: any) {
      console.error('[Storage] Cleanup error:', e);
      onMessage({ type: 'error', text: t('storagePanel.errorCleanup', { message: e.message || t('storagePanel.errorUnknown') }) });
    } finally {
      setIsRunningCleanup(false);
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
          <h3 className="text-xl font-bold text-slate-900">{t('storagePanel.title')}</h3>
          <p className="text-sm text-slate-500 mt-1">{t('storagePanel.subtitle')}</p>
        </div>
        <button
          onClick={loadStats}
          disabled={isLoading}
          className="p-2 hover:bg-slate-100 rounded-xl transition-all"
        >
          <RefreshCw size={20} className={`text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Storage Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl">
              <HardDrive size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{stats?.totalAttendanceRecords || 0}</p>
              <p className="text-xs text-slate-500 font-medium">{t('storagePanel.totalRecords')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-xl">
              <Camera size={20} className="text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{stats?.recordsWithSelfies || 0}</p>
              <p className="text-xs text-slate-500 font-medium">{t('storagePanel.withSelfies')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl">
              <HardDrive size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{t('storagePanel.estStorageValue', { mb: stats?.estimatedStorageMB || 0 })}</p>
              <p className="text-xs text-slate-500 font-medium">{t('storagePanel.estStorage')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <Clock size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{t('storagePanel.retentionValue', { days: stats?.retentionDays || 30 })}</p>
              <p className="text-xs text-slate-500 font-medium">{t('storagePanel.retention')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Last Cleanup Info */}
      {stats?.lastCleanup && (
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 text-slate-600 mb-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <span className="font-bold text-sm">{t('storagePanel.lastCleanupTitle')}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-400 text-xs">{t('storagePanel.runTime')}</p>
              <p className="font-medium text-slate-700">
                {new Date(stats.lastCleanup.lastRun).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">{t('storagePanel.recordsCleaned')}</p>
              <p className="font-medium text-slate-700">{stats.lastCleanup.recordsCleaned}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">{t('storagePanel.errors')}</p>
              <p className={`font-medium ${stats.lastCleanup.errors > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {stats.lastCleanup.errors}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">{t('storagePanel.cutoffDate')}</p>
              <p className="font-medium text-slate-700">{stats.lastCleanup.cutoffDate}</p>
            </div>
          </div>
        </div>
      )}

      {/* Retention Settings */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h4 className="font-bold text-slate-900 mb-4">{t('storagePanel.policyTitle')}</h4>
        <p className="text-sm text-slate-500 mb-4">
          {t('storagePanel.policyDesc')}
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
                {t(`storagePanel.options.${value}.label`)}
              </p>
              <p className="text-xs text-slate-500 mt-1">{t(`storagePanel.options.${value}.desc`)}</p>
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
            {t('storagePanel.savePolicy')}
          </button>

          <button
            onClick={handleManualCleanup}
            disabled={isRunningCleanup}
            className="px-6 py-3 bg-red-50 text-red-700 rounded-xl font-bold flex items-center gap-2 hover:bg-red-100 transition-all disabled:opacity-50"
          >
            {isRunningCleanup ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
            {t('storagePanel.runCleanup')}
          </button>
        </div>

        {/* Warning */}
        <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-800 text-sm">{t('storagePanel.notesTitle')}</p>
            <ul className="text-xs text-amber-700 mt-1 space-y-1">
              <li>{t('storagePanel.notes1')}</li>
              <li>{t('storagePanel.notes2')}</li>
              <li>{t('storagePanel.notes3')}</li>
              <li>{t('storagePanel.notes4')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StorageManagement;
