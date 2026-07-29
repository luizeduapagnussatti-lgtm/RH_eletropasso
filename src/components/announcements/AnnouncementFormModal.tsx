import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import { Announcement, AnnouncementPriority, Employee, Role, MessagingChannel } from '../../types';
import { tRole } from '../../i18n/statusMaps';
import { employeeService } from '../../services/employee.service';
import { organizationService } from '../../services/organization.service';
import { MessagingRecipientPicker } from '../messaging/MessagingRecipientPicker';
import {
  estimateDispatchDurationMs,
  filterEligibleEmployees,
  formatDurationSeconds,
  isEligibleForChannel,
  resolveThrottleFromConfig,
} from '../../utils/messagingThrottle';

const ALL_ROLES: Role[] = ['ADMIN', 'HR', 'MANAGER', 'TEAM_LEAD', 'MANAGEMENT', 'EMPLOYEE'];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    content: string;
    priority: AnnouncementPriority;
    targetRoles: Role[];
    expiresAt?: string;
    channels: MessagingChannel[];
    recipientProfileIds?: string[];
  }) => Promise<void>;
  editingAnnouncement?: Announcement | null;
}

export const AnnouncementFormModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, editingAnnouncement }) => {
  const { t } = useTranslation('announcements');
  const { t: tm } = useTranslation('messaging');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('NORMAL');
  const [targetRoles, setTargetRoles] = useState<Role[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [channels, setChannels] = useState<MessagingChannel[]>(['APP', 'EMAIL', 'WHATSAPP']);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmSend, setConfirmSend] = useState(false);
  const [estSeconds, setEstSeconds] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const roleFilteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (targetRoles.length === 0) return true;
      return targetRoles.includes(emp.role as Role);
    });
  }, [employees, targetRoles]);

  const externalChannels = useMemo(
    () => channels.filter(c => c === 'EMAIL' || c === 'WHATSAPP'),
    [channels],
  );

  const dispatchPreview = useMemo(() => {
    const targets = roleFilteredEmployees.filter(e => selectedIds.has(e.id));
    let wa = 0;
    let em = 0;
    for (const emp of targets) {
      if (externalChannels.includes('WHATSAPP') && isEligibleForChannel(emp, 'WHATSAPP')) wa++;
      if (externalChannels.includes('EMAIL') && isEligibleForChannel(emp, 'EMAIL')) em++;
    }
    return { wa, em, total: wa + em };
  }, [roleFilteredEmployees, selectedIds, externalChannels]);

  useEffect(() => {
    if (!isOpen || editingAnnouncement) return;
    void employeeService.getEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, [isOpen, editingAnnouncement]);

  useEffect(() => {
    if (editingAnnouncement) {
      setTitle(editingAnnouncement.title);
      setContent(editingAnnouncement.content);
      setPriority(editingAnnouncement.priority);
      setTargetRoles(editingAnnouncement.targetRoles || []);
      setExpiresAt(editingAnnouncement.expiresAt ? editingAnnouncement.expiresAt.split(' ')[0] : '');
    } else {
      setTitle('');
      setContent('');
      setPriority('NORMAL');
      setTargetRoles([]);
      setExpiresAt('');
      setChannels(['APP', 'EMAIL', 'WHATSAPP']);
      setConfirmSend(false);
    }
  }, [editingAnnouncement, isOpen]);

  useEffect(() => {
    if (!isOpen || editingAnnouncement) return;
    const eligible = filterEligibleEmployees(roleFilteredEmployees, channels);
    setSelectedIds(new Set(eligible.map(e => e.id)));
  }, [isOpen, editingAnnouncement, roleFilteredEmployees, channels]);

  useEffect(() => {
    if (!isOpen || externalChannels.length === 0) return;
    void organizationService.getMessagingConfig().then(cfg => {
      const throttle = resolveThrottleFromConfig(cfg);
      const ms = estimateDispatchDurationMs(dispatchPreview.wa, dispatchPreview.em, throttle);
      setEstSeconds(formatDurationSeconds(ms));
    });
  }, [isOpen, dispatchPreview.wa, dispatchPreview.em, externalChannels.length]);

  const toggleChannel = (ch: MessagingChannel) => {
    setChannels(prev => (prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]));
    setConfirmSend(false);
  };

  const toggleRole = (role: Role) => {
    setTargetRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
    setConfirmSend(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    const needsExternalConfirm = !editingAnnouncement
      && externalChannels.length > 0
      && dispatchPreview.total > 0;

    if (needsExternalConfirm && !confirmSend) {
      setConfirmSend(true);
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        priority,
        targetRoles,
        expiresAt: expiresAt || undefined,
        channels,
        recipientProfileIds: externalChannels.length > 0 ? [...selectedIds] : undefined,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save announcement', err);
      setConfirmSend(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const showRecipientPicker = !editingAnnouncement && externalChannels.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            {editingAnnouncement ? t('editAnnouncement') : t('newAnnouncement')}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('titleField')}</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
              required
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              placeholder={t('titlePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('content')}</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              required
              rows={4}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
              placeholder={t('contentPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('priority')}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPriority('NORMAL')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  priority === 'NORMAL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {t('normal')}
              </button>
              <button
                type="button"
                onClick={() => setPriority('URGENT')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  priority === 'URGENT'
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {t('urgent')}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {t('targetRoles')} <span className="text-slate-400 normal-case font-medium">{t('targetRolesHint')}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    targetRoles.includes(role)
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {tRole(role)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {t('deliveryChannels')} <span className="text-slate-400 normal-case font-medium">{t('deliveryChannelsHint')}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {(['APP', 'EMAIL', 'WHATSAPP'] as MessagingChannel[]).map(ch => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(ch)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    channels.includes(ch)
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {t(`channel.${ch}`)}
                </button>
              ))}
            </div>
          </div>

          {showRecipientPicker && (
            <>
              <MessagingRecipientPicker
                employees={roleFilteredEmployees}
                channels={channels}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                disabled={isSaving}
              />
              {dispatchPreview.total > 0 && (
                <p className="text-xs text-slate-500">
                  {tm('dispatchPreview', {
                    total: dispatchPreview.total,
                    whatsapp: dispatchPreview.wa,
                    email: dispatchPreview.em,
                    seconds: estSeconds,
                  })}
                </p>
              )}
            </>
          )}

          {confirmSend && showRecipientPicker && dispatchPreview.total > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 text-sm text-amber-900 border border-amber-200">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{tm('confirmDispatch', { count: dispatchPreview.total, seconds: estSeconds })}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {t('expiresAt')} <span className="text-slate-400 normal-case font-medium">{t('expiresAtHint')}</span>
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving || !title.trim() || !content.trim()}
            className="w-full py-4 bg-primary text-white rounded-2xl font-semibold text-sm uppercase tracking-widest shadow-lg shadow-primary-light/50 hover:bg-primary-hover transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving
              ? t('saving')
              : confirmSend && showRecipientPicker && dispatchPreview.total > 0
                ? tm('confirmSendButton')
                : editingAnnouncement
                  ? t('updateAnnouncement')
                  : t('postAnnouncement')}
          </button>
        </form>
      </div>
    </div>
  );
};
