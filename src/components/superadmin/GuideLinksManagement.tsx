import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, RotateCcw, Loader2, ExternalLink, BookOpen } from 'lucide-react';
import { superAdminService } from '../../services/superadmin.service';
import { tutorialService } from '../../services/tutorial.service';
import { getDefaultGuideLinks, clearGuideLinksCache } from '../onboarding/HelpButton';

interface Tutorial {
  id: string;
  title: string;
  slug: string;
  status: string;
}

const HELP_POINT_IDS: { id: string; sectionKey: string }[] = [
  { id: 'sidebar.dashboard', sectionKey: 'sidebarMenu' },
  { id: 'sidebar.profile', sectionKey: 'sidebarMenu' },
  { id: 'sidebar.attendance-logs', sectionKey: 'sidebarMenu' },
  { id: 'sidebar.attendance-audit', sectionKey: 'sidebarMenu' },
  { id: 'sidebar.leave', sectionKey: 'sidebarMenu' },
  { id: 'sidebar.announcements', sectionKey: 'sidebarMenu' },
  { id: 'sidebar.admin-notifications', sectionKey: 'sidebarMenu' },
  { id: 'sidebar.employees', sectionKey: 'sidebarMenu' },
  { id: 'sidebar.performance-review', sectionKey: 'sidebarMenu' },
  { id: 'sidebar.organization', sectionKey: 'sidebarMenu' },
  { id: 'sidebar.reports', sectionKey: 'sidebarMenu' },
  { id: 'sidebar.settings', sectionKey: 'sidebarMenu' },
  { id: 'dashboard.admin', sectionKey: 'dashboard' },
  { id: 'dashboard.manager', sectionKey: 'dashboard' },
  { id: 'dashboard.employee', sectionKey: 'dashboard' },
  { id: 'attendance.clockin', sectionKey: 'attendance' },
  { id: 'attendance.logs', sectionKey: 'attendance' },
  { id: 'attendance.audit', sectionKey: 'attendance' },
  { id: 'leave.balance', sectionKey: 'leave' },
  { id: 'leave.apply', sectionKey: 'leave' },
  { id: 'leave.manager', sectionKey: 'leave' },
  { id: 'leave.hr', sectionKey: 'leave' },
  { id: 'employees.directory', sectionKey: 'employees' },
  { id: 'employees.create', sectionKey: 'employees' },
  { id: 'org.structure', sectionKey: 'organization' },
  { id: 'org.teams', sectionKey: 'organization' },
  { id: 'org.placement', sectionKey: 'organization' },
  { id: 'org.shifts', sectionKey: 'organization' },
  { id: 'org.workflow', sectionKey: 'organization' },
  { id: 'org.leaves', sectionKey: 'organization' },
  { id: 'org.holidays', sectionKey: 'organization' },
  { id: 'org.notifications', sectionKey: 'organization' },
  { id: 'org.system', sectionKey: 'organization' },
  { id: 'reports.generator', sectionKey: 'reports' },
  { id: 'review.employee', sectionKey: 'reviews' },
  { id: 'review.manager', sectionKey: 'reviews' },
  { id: 'review.hr', sectionKey: 'reviews' },
  { id: 'announcements', sectionKey: 'other' },
  { id: 'notifications.admin', sectionKey: 'other' },
  { id: 'settings.profile', sectionKey: 'other' },
  { id: 'settings.theme', sectionKey: 'other' },
];

interface Props {
  onMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}

const GuideLinksManagement: React.FC<Props> = ({ onMessage }) => {
  const { t } = useTranslation('superadmin');
  const [linkMap, setLinkMap] = useState<Record<string, string>>({});
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [currentLinks, allTutorials] = await Promise.all([
          superAdminService.getGuideHelpLinks(),
          tutorialService.getAllTutorials(),
        ]);
        const defaults = getDefaultGuideLinks();
        setLinkMap(currentLinks && Object.keys(currentLinks).length > 0 ? currentLinks : defaults);
        setTutorials(allTutorials.filter((tut: any) => tut.status === 'PUBLISHED').map((tut: any) => ({
          id: tut.id,
          title: tut.title,
          slug: tut.slug,
          status: tut.status,
        })));
      } catch (e) {
        console.warn('[GuideLinks] Load failed:', e);
        setLinkMap(getDefaultGuideLinks());
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleChange = (helpPointId: string, slug: string) => {
    setLinkMap(prev => ({ ...prev, [helpPointId]: slug }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await superAdminService.setGuideHelpLinks(linkMap);
      clearGuideLinksCache();
      onMessage({ type: 'success', text: t('guideLinks.successSaved') });
    } catch (e: any) {
      onMessage({ type: 'error', text: e?.message || t('guideLinks.errorSave') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setLinkMap(getDefaultGuideLinks());
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const sections = HELP_POINT_IDS.reduce<Record<string, { id: string; label: string }[]>>((acc, item) => {
    const sectionName = t(`guideLinks.sections.${item.sectionKey}`);
    if (!acc[sectionName]) acc[sectionName] = [];
    acc[sectionName].push({ id: item.id, label: t(`guideLinks.helpPoints.${item.id}.label`) });
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen size={22} className="text-primary" />
            {t('guideLinks.title')}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {t('guideLinks.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
          >
            <RotateCcw size={14} /> {t('guideLinks.reset')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-all disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {t('guideLinks.save')}
          </button>
        </div>
      </div>

      {Object.entries(sections).map(([sectionName, items]) => (
        <div key={sectionName} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{sectionName}</p>
          </div>
          <div className="divide-y divide-slate-50">
            {items.map(item => (
              <div key={item.id} className="flex items-center justify-between px-4 py-3 gap-4">
                <label className="text-sm font-medium text-slate-700 whitespace-nowrap min-w-0 truncate flex-shrink-0">
                  {item.label}
                </label>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select
                    value={linkMap[item.id] || ''}
                    onChange={(e) => handleChange(item.id, e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 max-w-[220px]"
                  >
                    <option value="">{t('guideLinks.none')}</option>
                    {tutorials.map(tut => (
                      <option key={tut.id} value={tut.slug}>{tut.title}</option>
                    ))}
                  </select>
                  {linkMap[item.id] && (
                    <button
                      onClick={() => window.open(`/how-to-use/${linkMap[item.id]}`, '_blank')}
                      title={t('guideLinks.tooltipPreview')}
                      className="p-1 text-slate-400 hover:text-primary transition-colors"
                    >
                      <ExternalLink size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default GuideLinksManagement;
