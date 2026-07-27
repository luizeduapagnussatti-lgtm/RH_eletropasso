
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  BarChart3,
  Settings,
  LogOut,
  Network,
  UserCircle,
  ChevronRight,
  List,
  History,
  Shield,
  ClipboardCheck,
  Megaphone,
  Bell,
  CalendarRange,
  CalendarCheck,
  CalendarClock,
  Wallet,
  CreditCard,
  Clock,
  Radio,
  Calculator,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import HelpButton from './onboarding/HelpButton';
import { APP_NAME, APP_ICON_PATH } from '../config/branding';
import { tRole } from '../i18n/statusMaps';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string, params?: any) => void;
  onLogout: () => void;
  role: string;
  user?: any;
  /** Desktop only: icon rail vs full labels */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Hide collapse control (e.g. mobile drawer always expanded) */
  showCollapseToggle?: boolean;
}

/** A single navigable entry inside a sidebar section. */
interface MenuItem {
  /** Stable key used for React lists and help anchors. */
  id: string;
  labelKey: string;
  icon: LucideIcon;
  roles: string[];
  /** Actual route to navigate to (defaults to `id`). Enables deep-links. */
  route?: string;
  /** Extra navigation params (e.g. deep-link to an Organization tab). */
  params?: Record<string, unknown>;
}

/** A labelled group of menu items following the DMP intent model. */
interface MenuSection {
  id: string;
  /** i18n key for the section header; `null` renders an unlabelled group. */
  labelKey: string | null;
  items: MenuItem[];
}

const ALL_ROLES = ['ADMIN', 'HR', 'MANAGER', 'TEAM_LEAD', 'MANAGEMENT', 'EMPLOYEE'];
const STAFF_ROLES = ['ADMIN', 'HR', 'MANAGER', 'TEAM_LEAD', 'MANAGEMENT'];
const ADMIN_HR = ['ADMIN', 'HR'];
const PUNCHING_ROLES = ['MANAGER', 'TEAM_LEAD', 'EMPLOYEE'];

const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  onNavigate,
  onLogout,
  role,
  user,
  collapsed = false,
  onToggleCollapse,
  showCollapseToggle = false,
}) => {
  const { t } = useTranslation(['nav', 'common']);
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const superAdminSections: MenuSection[] = [
    {
      id: 'main',
      labelKey: null,
      items: [
        { id: 'super-admin', labelKey: 'organizations', icon: Shield, roles: ['SUPER_ADMIN'] },
        { id: 'profile', labelKey: 'myProfile', icon: UserCircle, roles: ['SUPER_ADMIN'] },
      ],
    },
  ];

  // Sections mirror the DMP REP mental model: separate "records" from
  // "communication with the clock" from daily "operation" from "reports".
  const regularSections: MenuSection[] = [
    {
      id: 'main',
      labelKey: null,
      items: [
        { id: 'dashboard', labelKey: 'dashboard', icon: LayoutDashboard, roles: ALL_ROLES },
        { id: 'profile', labelKey: 'myProfile', icon: UserCircle, roles: ALL_ROLES },
        // Personal punch history (selfie/GPS) — distinct from the REP mirror
        { id: 'attendance-logs', labelKey: 'myAttendance', icon: History, roles: PUNCHING_ROLES },
      ],
    },
    {
      id: 'operacao',
      labelKey: 'section.operacao',
      items: [
        { id: 'ponto', labelKey: 'pontoHub', icon: LayoutGrid, roles: STAFF_ROLES },
        { id: 'timesheet', labelKey: 'timesheet', icon: CalendarRange, roles: ALL_ROLES },
        { id: 'apuracao', labelKey: 'apuracao', icon: Calculator, roles: ADMIN_HR },
      ],
    },
    {
      id: 'cadastros',
      labelKey: 'section.cadastros',
      items: [
        { id: 'employees', labelKey: 'cards', icon: CreditCard, roles: STAFF_ROLES },
        { id: 'org-shifts', labelKey: 'shifts', icon: Clock, roles: ADMIN_HR, route: 'organization', params: { tab: 'SHIFTS' } },
        { id: 'org-holidays', labelKey: 'holidays', icon: CalendarCheck, roles: ADMIN_HR, route: 'organization', params: { tab: 'HOLIDAYS' } },
      ],
    },
    {
      id: 'comunicacao',
      labelKey: 'section.comunicacao',
      items: [
        { id: 'comunicacao', labelKey: 'communication', icon: Radio, roles: ['ADMIN'] },
      ],
    },
    {
      id: 'relatorios',
      labelKey: 'section.relatorios',
      items: [
        { id: 'reports', labelKey: 'reports', icon: BarChart3, roles: ADMIN_HR },
        { id: 'payroll', labelKey: 'payroll', icon: Wallet, roles: ADMIN_HR },
      ],
    },
    {
      id: 'rhplus',
      labelKey: 'section.rhplus',
      items: [
        { id: 'leave', labelKey: 'leave', icon: CalendarDays, roles: ALL_ROLES },
        { id: 'roster', labelKey: 'roster', icon: CalendarClock, roles: ['ADMIN', 'HR', 'MANAGER'] },
        { id: 'attendance-audit', labelKey: 'attendanceAudit', icon: List, roles: STAFF_ROLES },
        { id: 'performance-review', labelKey: 'performance', icon: ClipboardCheck, roles: ALL_ROLES },
        { id: 'announcements', labelKey: 'announcements', icon: Megaphone, roles: ALL_ROLES },
        { id: 'admin-notifications', labelKey: 'notifications', icon: Bell, roles: ADMIN_HR },
        { id: 'organization', labelKey: 'organization', icon: Network, roles: ADMIN_HR },
        { id: 'settings', labelKey: 'settings', icon: Settings, roles: ['ADMIN'] },
      ],
    },
  ];

  const sections = (isSuperAdmin ? superAdminSections : regularSections)
    .map(section => ({
      ...section,
      items: section.items.filter(item => item.roles.includes(role)),
    }))
    .filter(section => section.items.length > 0);

  return (
    <aside
      className={`bg-[#182230] h-screen flex flex-col border-r border-[#243044] shadow-sm relative z-50 transition-[width] duration-200 ease-out motion-reduce:transition-none ${
        collapsed ? 'w-[4.5rem]' : 'w-80'
      }`}
    >
      <div className={collapsed ? 'p-3 pb-3' : 'p-6 pb-5'}>
        <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'gap-3'}`}>
          <div
            className={`shrink-0 rounded-2xl bg-[#0f1620] border border-[#243044] shadow-md flex items-center justify-center ${
              collapsed ? 'w-10 h-10 p-1' : 'w-14 h-14 p-1.5'
            }`}
          >
            <img
              src={APP_ICON_PATH}
              className="w-full h-full object-contain"
              alt={APP_NAME}
            />
          </div>
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="relative shrink-0">
                <img
                  src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.name || 'User'}&background=random`}
                  className="w-12 h-12 rounded-full border-2 border-[#243044] shadow-md bg-[#0f1620] object-cover"
                  alt={t('common:profile')}
                />
                <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#e23d42] border-2 border-[#182230] rounded-full" />
              </div>
              <div className="min-w-0 text-left">
                <h2 className="text-sm font-semibold text-white leading-tight truncate">
                  {user?.name || t('common:userName')}
                </h2>
                <p className="text-[10px] font-bold text-white/45 mt-0.5 uppercase tracking-tight truncate">
                  {user?.designation || tRole(role) || t('common:specialist')}
                </p>
              </div>
            </div>
          )}
        </div>
        {!collapsed && <div className="w-full h-px bg-[#243044] mt-5" />}
      </div>

      <nav className={`flex-1 space-y-1 overflow-y-auto no-scrollbar ${collapsed ? 'px-2' : 'px-4'}`}>
        {sections.map((section, sectionIndex) => (
          <div key={section.id} className={sectionIndex > 0 ? 'pt-3' : ''}>
            {section.labelKey && (
              collapsed ? (
                <div className="mx-2 my-2 h-px bg-[#243044]" aria-hidden />
              ) : (
                <p className="px-6 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
                  {t(section.labelKey)}
                </p>
              )
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const navId = item.route ?? item.id;
                const isActive = !item.params && currentPath === navId;
                const label = t(item.labelKey);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(navId, item.params)}
                    title={collapsed ? label : undefined}
                    aria-label={label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center rounded-2xl transition-all duration-200 relative group ${
                      collapsed
                        ? 'justify-center px-2 py-3'
                        : 'justify-between px-6 py-3.5'
                    } ${
                      isActive
                        ? 'bg-[#c41e24]/15 text-[#e23d42]'
                        : 'text-white/55 hover:bg-white/5 hover:text-[#e23d42]'
                    }`}
                  >
                    <div className={`flex items-center ${collapsed ? '' : 'gap-4'}`}>
                      <item.icon
                        size={22}
                        className={isActive ? 'text-[#c41e24]' : 'text-[#e23d42]/70 group-hover:text-[#e23d42]'}
                        aria-hidden
                      />
                      {!collapsed && (
                        <span className="font-bold text-sm tracking-tight">{label}</span>
                      )}
                    </div>
                    {!collapsed && (
                      <div className="flex items-center gap-1">
                        {!isSuperAdmin && (
                          <HelpButton helpPointId={`sidebar.${item.id}`} size={14} variant="sidebar" />
                        )}
                        <ChevronRight
                          size={16}
                          className={`transition-all duration-200 ${
                            isActive
                              ? 'text-[#e23d42] opacity-100 translate-x-0'
                              : 'text-white/30 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'
                          }`}
                          aria-hidden
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className={`pt-4 pb-2 space-y-3 ${collapsed ? '' : 'space-y-4'}`}>
          <button
            type="button"
            onClick={onLogout}
            title={collapsed ? t('signOut') : undefined}
            aria-label={t('signOut')}
            className={`w-full flex items-center border border-[#243044] bg-white/[0.04] group hover:bg-[#c41e24]/12 hover:border-[#c41e24]/35 transition-all ${
              collapsed
                ? 'justify-center p-2.5 rounded-2xl'
                : 'justify-between p-5 rounded-3xl'
            }`}
          >
            <div className={`flex items-center ${collapsed ? '' : 'gap-4'}`}>
              <div
                className={`bg-[#0f1620] text-[#e23d42] group-hover:text-[#c41e24] transition-colors ${
                  collapsed ? 'p-2 rounded-xl' : 'p-3 rounded-2xl'
                }`}
              >
                <LogOut size={collapsed ? 18 : 20} aria-hidden />
              </div>
              {!collapsed && (
                <span className="font-semibold text-sm text-white uppercase tracking-tight">{t('signOut')}</span>
              )}
            </div>
            {!collapsed && (
              <ChevronRight size={18} className="text-white/30 group-hover:text-[#e23d42] transition-colors" aria-hidden />
            )}
          </button>

          {showCollapseToggle && onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
              aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
              aria-expanded={!collapsed}
              className={`w-full flex items-center text-white/45 hover:text-[#e23d42] hover:bg-white/5 transition-colors ${
                collapsed ? 'justify-center p-2.5 rounded-2xl' : 'gap-3 px-4 py-3 rounded-2xl'
              }`}
            >
              {collapsed ? (
                <PanelLeftOpen size={20} aria-hidden />
              ) : (
                <>
                  <PanelLeftClose size={20} aria-hidden />
                  <span className="text-xs font-semibold tracking-tight">{t('collapseSidebar')}</span>
                </>
              )}
            </button>
          )}

          {!collapsed && (
            <div className="text-center">
              <p className="text-[10px] font-semibold text-white/25 uppercase tracking-[0.3em]">RH_Eletropasso</p>
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;
