import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Announcement, AnnouncementPriority, Role } from '../../types';
import { tRole } from '../../i18n/statusMaps';

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
  }) => Promise<void>;
  editingAnnouncement?: Announcement | null;
}

export const AnnouncementFormModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, editingAnnouncement }) => {
  const { t } = useTranslation('announcements');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('NORMAL');
  const [targetRoles, setTargetRoles] = useState<Role[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
    }
  }, [editingAnnouncement, isOpen]);

  const toggleRole = (role: Role) => {
    setTargetRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setIsSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        priority,
        targetRoles,
        expiresAt: expiresAt || undefined,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save announcement', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

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
            {isSaving ? t('saving') : editingAnnouncement ? t('updateAnnouncement') : t('postAnnouncement')}
          </button>
        </form>
      </div>
    </div>
  );
};
