
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
} from 'lucide-react';
import HelpButton from './onboarding/HelpButton';

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
    { id: 'attendance-logs', labelKey: 'myAttendance', icon: History, roles: ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] },
    { id: 'attendance-audit', labelKey: 'attendanceAudit', icon: List, roles: ['ADMIN', 'HR', 'MANAGER'] },
    { id: 'leave', labelKey: 'leave', icon: CalendarDays, roles: ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] },
    { id: 'announcements', labelKey: 'announcements', icon: Megaphone, roles: ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] },
    { id: 'admin-notifications', labelKey: 'notifications', icon: Bell, roles: ['ADMIN', 'HR'] },
    { id: 'employees', labelKey: 'teamDirectory', icon: Users, roles: ['ADMIN', 'HR', 'MANAGER'] },
    { id: 'performance-review', labelKey: 'performance', icon: ClipboardCheck, roles: ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] },
    { id: 'organization', labelKey: 'organization', icon: Network, roles: ['ADMIN', 'HR'] },
    { id: 'reports', labelKey: 'reports', icon: BarChart3, roles: ['ADMIN', 'HR'] },
    { id: 'settings', labelKey: 'settings', icon: Settings, roles: ['ADMIN', 'HR'] },
  ];

  const menuItems = isSuperAdmin ? superAdminMenuItems : regularMenuItems;
  const filteredItems = menuItems.filter(item => item.roles.includes(role));

  return (
    <aside className="w-80 bg-white h-screen flex flex-col border-r border-slate-100 shadow-sm relative z-50">
      <div className="p-10 pb-8 flex flex-col items-center text-center">
        <div className="relative mb-4">
          <img
            src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.name || 'User'}&background=random`}
            className="w-24 h-24 rounded-full border-4 border-white shadow-xl bg-slate-50 object-cover"
            alt={t('common:profile')}
          />
          <div className="absolute bottom-1 right-1 w-5 h-5 bg-primary border-4 border-white rounded-full"></div>
        </div>
        <h2 className="text-xl font-semibold text-slate-900 leading-tight">{user?.name || t('common:userName')}</h2>
        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-tight">{user?.designation || t('common:specialist')}</p>
        <div className="w-full h-px bg-slate-50 mt-8"></div>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto no-scrollbar">
        {filteredItems.map((item) => (
          <div key={item.id} className="space-y-1">
            <button
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl transition-all duration-300 relative group ${
                currentPath === item.id
                  ? 'bg-primary-light/50 text-primary'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-4">
                {currentPath === item.id && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-primary rounded-r-full"></div>
                )}
                <item.icon size={22} className={currentPath === item.id ? 'text-primary' : 'text-slate-400'} />
                <span className="font-bold text-sm tracking-tight">{t(item.labelKey)}</span>
              </div>
              <div className="flex items-center gap-1">
                {!isSuperAdmin && (
                  <HelpButton helpPointId={`sidebar.${item.id}`} size={14} variant="sidebar" />
                )}
                <ChevronRight size={16} className={`transition-all duration-300 ${currentPath === item.id ? 'text-primary opacity-100 translate-x-0' : 'text-slate-200 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'}`} />
              </div>
            </button>
          </div>
        ))}

        <div className="pt-4 pb-2 space-y-4">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-between p-6 bg-slate-50 border border-slate-100 rounded-3xl group hover:bg-rose-50 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white rounded-2xl shadow-sm text-slate-600 group-hover:text-rose-600 transition-colors">
                <LogOut size={20} />
              </div>
              <span className="font-semibold text-sm text-slate-900 uppercase tracking-tight">{t('signOut')}</span>
            </div>
            <ChevronRight size={18} className="text-slate-300 group-hover:text-rose-300 transition-colors" />
          </button>

          <div className="text-center">
            <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-[0.3em]">OpenHRApp v2.9.0</p>
          </div>
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;
