import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Send, RefreshCw, AlertCircle, Bell } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { NotificationType, NotificationPriority } from '../../types';
import { tRole, tStatus } from '../../i18n/statusMaps';

interface Employee {
  id: string;
  name: string;
  department: string;
  role?: string;
}

interface Props {
  employees: Employee[];
  onClose: () => void;
  onSent: () => void;
}

type RecipientMode = 'ALL' | 'BY_ROLE' | 'SPECIFIC';

const NOTIFICATION_TYPES: NotificationType[] = ['SYSTEM', 'ANNOUNCEMENT', 'LEAVE', 'ATTENDANCE', 'REVIEW'];
const ROLES = ['EMPLOYEE', 'MANAGER', 'TEAM_LEAD', 'HR', 'ADMIN', 'MANAGEMENT', 'SUPER_ADMIN'];

const AdminNotificationFormModal: React.FC<Props> = ({ employees, onClose, onSent }) => {
  const { t } = useTranslation('notifications');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recipientMode, setRecipientMode] = useState<RecipientMode>('ALL');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [type, setType] = useState<NotificationType>('SYSTEM');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('NORMAL');

  const recipientModes: { value: RecipientMode; labelKey: 'recipientAll' | 'recipientByRole' | 'recipientSpecific' }[] = [
    { value: 'ALL', labelKey: 'recipientAll' },
    { value: 'BY_ROLE', labelKey: 'recipientByRole' },
    { value: 'SPECIFIC', labelKey: 'recipientSpecific' },
  ];

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const toggleUser = (id: string) => {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
    );
  };

  const getTargetUserIds = (): string[] => {
    if (recipientMode === 'ALL') return employees.map(e => e.id);
    if (recipientMode === 'BY_ROLE') return employees.filter(e => selectedRoles.includes(e.role || 'EMPLOYEE')).map(e => e.id);
    return selectedUserIds;
  };

  const matchedUsersCount = employees.filter(e => selectedRoles.includes(e.role || 'EMPLOYEE')).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) { setError(t('titleRequired')); return; }

    const targetIds = getTargetUserIds();
    if (targetIds.length === 0) { setError(t('noRecipients')); return; }

    setIsProcessing(true);
    try {
      const notifications = targetIds.map(userId => ({
        userId,
        type,
        title: title.trim(),
        message: message.trim() || undefined,
        priority,
      }));
      await hrService.createBulkNotifications(notifications);
      onSent();
    } catch (err: any) {
      setError(err.message || t('sendFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in max-h-[90vh] flex flex-col">
        <div className="p-8 bg-primary text-white flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <Bell size={20} />
            <h3 className="text-lg font-semibold uppercase tracking-tight">{t('compose')}</h3>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-lg transition-colors"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-4 bg-rose-50 text-rose-700 text-xs font-bold rounded-2xl flex gap-2 items-start">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('recipients')}</label>
            <div className="flex gap-2">
              {recipientModes.map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRecipientMode(value)}
                  className={`flex-1 py-3 px-2 rounded-xl text-xs font-semibold border transition-all ${recipientMode === value ? 'bg-primary text-white border-primary' : 'bg-slate-50 text-slate-600 border-slate-100 hover:border-slate-200'}`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>

          {recipientMode === 'BY_ROLE' && (
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('selectRoles')}</label>
              <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                {ROLES.map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${selectedRoles.includes(role) ? 'bg-primary text-white' : 'bg-white text-slate-400 border border-slate-200'}`}
                  >
                    {tRole(role)}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 px-1">
                {t('usersMatched', { count: matchedUsersCount })}
              </p>
            </div>
          )}

          {recipientMode === 'SPECIFIC' && (
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('selectUsers', { count: selectedUserIds.length })}</label>
              <div className="h-40 overflow-y-auto border border-slate-200 rounded-xl p-2 grid grid-cols-2 gap-2 bg-slate-50/50">
                {employees.map(e => (
                  <div
                    key={e.id}
                    onClick={() => toggleUser(e.id)}
                    className={`p-2 rounded-lg text-xs font-bold cursor-pointer border ${selectedUserIds.includes(e.id) ? 'bg-primary-light border-primary text-primary' : 'bg-white border-slate-100 text-slate-500'}`}
                  >
                    {e.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('typeLabel')}</label>
            <select
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-semibold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all"
              value={type}
              onChange={e => setType(e.target.value as NotificationType)}
            >
              {NOTIFICATION_TYPES.map(notifType => (
                <option key={notifType} value={notifType}>{tStatus('notification', notifType)}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('titleField')}</label>
            <input
              required
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-semibold text-sm outline-none focus:ring-4 focus:ring-primary-light transition-all"
              placeholder={t('titlePlaceholder')}
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('message')}</label>
            <textarea
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-semibold text-sm min-h-[80px] outline-none focus:ring-4 focus:ring-primary-light transition-all"
              placeholder={t('messagePlaceholder')}
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('priorityLabel')}</label>
            <div className="flex gap-3">
              {(['NORMAL', 'URGENT'] as NotificationPriority[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs font-semibold border transition-all ${priority === p
                    ? (p === 'URGENT' ? 'bg-red-500 text-white border-red-500' : 'bg-primary text-white border-primary')
                    : 'bg-slate-50 text-slate-600 border-slate-100 hover:border-slate-200'
                  }`}
                >
                  {tStatus('priority', p)}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isProcessing}
            className="w-full py-5 bg-primary text-white rounded-xl font-semibold uppercase tracking-widest text-[10px] shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-all"
          >
            {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <Send size={16} />} {isProcessing ? t('sending') : t('send')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminNotificationFormModal;
