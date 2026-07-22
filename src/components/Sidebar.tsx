
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
} from 'lucide-react';
import HelpButton from './onboarding/HelpButton';
import { APP_NAME, APP_ICON_PATH } from '../config/branding';
import { tRole } from '../i18n/statusMaps';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  role: string;
  user?: any;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPath, onNavigate, onLogout, role, user }) => {
  const { t } = useTranslation(['nav', 'common']);
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const superAdminMenuItems = [
    { id: 'super-admin', labelKey: 'organizations', icon: Shield, roles: ['SUPER_ADMIN'] },
    { id: 'profile', labelKey: 'myProfile', icon: UserCircle, roles: ['SUPER_ADMIN'] },
  ];

  const regularMenuItems = [
    { id: 'dashboard', labelKey: 'dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] },
    { id: 'profile', labelKey: 'myProfile', icon: UserCircle, roles: ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] },
    // Punch history — managers/employees only (admin/HR administer; they don't clock in)
    { id: 'attendance-logs', labelKey: 'myAttendance', icon: History, roles: ['MANAGER', 'EMPLOYEE'] },
    { id: 'attendance-audit', labelKey: 'attendanceAudit', icon: List, roles: ['ADMIN', 'HR', 'MANAGER'] },
    { id: 'timesheet', labelKey: 'timesheet', icon: CalendarRange, roles: ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] },
    { id: 'leave', labelKey: 'leave', icon: CalendarDays, roles: ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] },
    { id: 'announcements', labelKey: 'announcements', icon: Megaphone, roles: ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] },
    { id: 'admin-notifications', labelKey: 'notifications', icon: Bell, roles: ['ADMIN', 'HR'] },
    { id: 'employees', labelKey: 'teamDirectory', icon: Users, roles: ['ADMIN', 'HR', 'MANAGER'] },
    { id: 'performance-review', labelKey: 'performance', icon: ClipboardCheck, roles: ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] },
    { id: 'organization', labelKey: 'organization', icon: Network, roles: ['ADMIN', 'HR'] },
    { id: 'reports', labelKey: 'reports', icon: BarChart3, roles: ['ADMIN', 'HR'] },
    // Full settings / system owner tools — Admin only; HR uses Meu perfil
    { id: 'settings', labelKey: 'settings', icon: Settings, roles: ['ADMIN'] },
  ];

  const menuItems = isSuperAdmin ? superAdminMenuItems : regularMenuItems;
  const filteredItems = menuItems.filter(item => item.roles.includes(role));

  return (
    <aside className="w-80 bg-[#182230] h-screen flex flex-col border-r border-[#243044] shadow-sm relative z-50">
      <div className="p-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 shrink-0 rounded-2xl bg-[#0f1620] border border-[#243044] shadow-md flex items-center justify-center p-1.5">
            <img
              src={APP_ICON_PATH}
              className="w-full h-full object-contain"
              alt={APP_NAME}
            />
          </div>
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
        </div>
        <div className="w-full h-px bg-[#243044] mt-5" />
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto no-scrollbar">
        {filteredItems.map((item) => {
          const isActive = currentPath === item.id;
          return (
            <div key={item.id} className="space-y-1">
              <button
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl transition-all duration-200 relative group ${
                  isActive
                    ? 'bg-[#c41e24]/15 text-[#e23d42]'
                    : 'text-white/55 hover:bg-white/5 hover:text-[#e23d42]'
                }`}
              >
                <div className="flex items-center gap-4">
                  <item.icon
                    size={22}
                    className={isActive ? 'text-[#c41e24]' : 'text-[#e23d42]/70 group-hover:text-[#e23d42]'}
                  />
                  <span className="font-bold text-sm tracking-tight">{t(item.labelKey)}</span>
                </div>
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
                  />
                </div>
              </button>
            </div>
          );
        })}

        <div className="pt-4 pb-2 space-y-4">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-between p-5 bg-white/[0.04] border border-[#243044] rounded-3xl group hover:bg-[#c41e24]/12 hover:border-[#c41e24]/35 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-[#0f1620] rounded-2xl text-[#e23d42] group-hover:text-[#c41e24] transition-colors">
                <LogOut size={20} />
              </div>
              <span className="font-semibold text-sm text-white uppercase tracking-tight">{t('signOut')}</span>
            </div>
            <ChevronRight size={18} className="text-white/30 group-hover:text-[#e23d42] transition-colors" />
          </button>

          <div className="text-center">
            <p className="text-[10px] font-semibold text-white/25 uppercase tracking-[0.3em]">RH_Eletropasso</p>
          </div>
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;
