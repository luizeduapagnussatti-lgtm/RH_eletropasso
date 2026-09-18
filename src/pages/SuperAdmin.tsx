import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2, Users, Edit, Eye, RefreshCw, X, Save,
  TrendingUp, Clock, AlertTriangle, CheckCircle2, UserCheck, Shield,
  HardDrive, BookOpen, Palette, Bell, Trash2
} from 'lucide-react';
import { superAdminService } from '../services/superadmin.service';
import { Organization, Employee, PlatformStats, User } from '../types';
import { tStatus, tRole } from '../i18n/statusMaps';
import StorageManagement from '../components/superadmin/StorageManagement';
import TutorialManagement from '../components/superadmin/TutorialManagement';
import AppearanceManagement from '../components/superadmin/AppearanceManagement';
import NotificationRetention from '../components/superadmin/NotificationRetention';

interface SuperAdminProps {
  user: User;
  onNavigate: (path: string) => void;
}

type ViewMode = 'list' | 'edit' | 'users';
type TabMode = 'organizations' | 'storage' | 'notifications' | 'appearance' | 'tutorials';

const SuperAdmin: React.FC<SuperAdminProps> = () => {
  const { t } = useTranslation('superadmin');
  const [activeTab, setActiveTab] = useState<TabMode>('organizations');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [orgUsers, setOrgUsers] = useState<Employee[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    subscriptionStatus: 'ACTIVE',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const [orgsData, statsData] = await Promise.all([
      superAdminService.getAllOrganizations(),
      superAdminService.getPlatformStats()
    ]);
    setOrganizations(orgsData);
    setStats(statsData);
    setIsLoading(false);
  };

  const handleUpdateOrg = async () => {
    if (!selectedOrg) return;

    setIsLoading(true);
    const result = await superAdminService.updateOrganization(selectedOrg.id, {
      name: formData.name,
      address: formData.address,
      subscriptionStatus: formData.subscriptionStatus as Organization['subscriptionStatus'],
    });

    if (result.success) {
      setMessage({ type: 'success', text: result.message });
      setViewMode('list');
      setSelectedOrg(null);
      await loadData();
    } else {
      setMessage({ type: 'error', text: result.message });
    }
    setIsLoading(false);
  };

  const handleViewUsers = async (org: Organization) => {
    setSelectedOrg(org);
    setIsLoading(true);
    const users = await superAdminService.getOrganizationUsers(org.id);
    setOrgUsers(users);
    setViewMode('users');
    setIsLoading(false);
  };

  const handleVerifyUser = async (userId: string) => {
    const result = await superAdminService.verifyUser(userId);
    if (result.success) {
      setMessage({ type: 'success', text: t('shell.success.userVerified') });
      if (selectedOrg) {
        const users = await superAdminService.getOrganizationUsers(selectedOrg.id);
        setOrgUsers(users);
      }
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(t('shell.confirm.deleteUser', { name: userName }))) {
      return;
    }

    const result = await superAdminService.deleteUser(userId);
    if (result.success) {
      setMessage({ type: 'success', text: t('shell.success.userDeleted') });
      if (selectedOrg) {
        const users = await superAdminService.getOrganizationUsers(selectedOrg.id);
        setOrgUsers(users);
      }
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  const openEditMode = (org: Organization) => {
    setSelectedOrg(org);
    const status = org.subscriptionStatus;
    setFormData({
      name: org.name,
      address: org.address || '',
      subscriptionStatus:
        status === 'EXPIRED' || status === 'SUSPENDED' ? status : 'ACTIVE',
    });
    setViewMode('edit');
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ACTIVE: 'bg-emerald-100 text-emerald-700',
      TRIAL: 'bg-amber-100 text-amber-700',
      EXPIRED: 'bg-red-100 text-red-700',
      SUSPENDED: 'bg-slate-100 text-slate-700'
    };
    return styles[status] || styles.ACTIVE;
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const tabClass = (tab: TabMode) =>
    `py-3 px-2 sm:px-4 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1 sm:gap-2 ${
      activeTab === tab ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
    }`;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight flex items-center gap-3">
            <Shield className="text-primary shrink-0" size={28} />
            <span className="truncate">{t('shell.title')}</span>
          </h1>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">{t('shell.subtitle')}</p>
        </div>
        {activeTab === 'organizations' && viewMode !== 'list' && (
          <button
            onClick={() => { setViewMode('list'); setSelectedOrg(null); }}
            className="self-start sm:self-auto px-5 sm:px-6 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-200 transition-all whitespace-nowrap"
          >
            <X size={20} /> {t('shell.backToList')}
          </button>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">{t('shell.tabGroup.platform')}</p>
        <div className="grid grid-cols-5 gap-1 sm:gap-2 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => { setActiveTab('organizations'); setViewMode('list'); }}
            className={tabClass('organizations')}
          >
            <Building2 size={16} className="shrink-0" /> <span className="hidden sm:inline">{t('shell.tab.orgs')}</span>
          </button>
          <button onClick={() => setActiveTab('storage')} className={tabClass('storage')}>
            <HardDrive size={16} className="shrink-0" /> <span className="hidden sm:inline">{t('shell.tab.storage')}</span>
          </button>
          <button onClick={() => setActiveTab('notifications')} className={tabClass('notifications')}>
            <Bell size={16} className="shrink-0" /> <span className="hidden sm:inline">{t('shell.tab.notifs')}</span>
          </button>
          <button onClick={() => setActiveTab('appearance')} className={tabClass('appearance')}>
            <Palette size={16} className="shrink-0" /> <span className="hidden sm:inline">{t('shell.tab.theme')}</span>
          </button>
          <button onClick={() => setActiveTab('tutorials')} className={tabClass('tutorials')}>
            <BookOpen size={16} className="shrink-0" /> <span className="hidden sm:inline">{t('shell.tab.tutorials')}</span>
          </button>
        </div>
      </div>

      {activeTab === 'storage' && (
        <StorageManagement onMessage={setMessage} />
      )}

      {activeTab === 'notifications' && (
        <NotificationRetention onMessage={setMessage} />
      )}

      {activeTab === 'tutorials' && (
        <TutorialManagement onMessage={setMessage} />
      )}

      {activeTab === 'appearance' && (
        <AppearanceManagement onMessage={setMessage} />
      )}

      {activeTab === 'organizations' && viewMode === 'list' && stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-light rounded-xl">
                <Building2 size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{stats.totalOrganizations}</p>
                <p className="text-xs text-slate-500 font-medium">{t('shell.stats.totalOrgs')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-xl">
                <Users size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{stats.totalUsers}</p>
                <p className="text-xs text-slate-500 font-medium">{t('shell.stats.totalUsers')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-xl">
                <CheckCircle2 size={20} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{stats.activeOrganizations}</p>
                <p className="text-xs text-slate-500 font-medium">{t('shell.stats.active')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-xl">
                <Clock size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{stats.trialOrganizations}</p>
                <p className="text-xs text-slate-500 font-medium">{t('shell.stats.trial')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-xl">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{stats.expiredOrganizations}</p>
                <p className="text-xs text-slate-500 font-medium">{t('shell.stats.expired')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-xl">
                <TrendingUp size={20} className="text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{stats.recentRegistrations}</p>
                <p className="text-xs text-slate-500 font-medium">{t('shell.stats.last30d')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'organizations' && viewMode === 'list' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">{t('shell.orgsPanel.title')}</h2>
            <button onClick={loadData} disabled={isLoading} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
              <RefreshCw size={20} className={`text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-slate-500">{t('shell.orgsPanel.loading')}</div>
          ) : organizations.length === 0 ? (
            <div className="p-12 text-center text-slate-500">{t('shell.orgsPanel.empty')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.orgsPanel.colOrganization')}</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.orgsPanel.colStatus')}</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.orgsPanel.colUsers')}</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.orgsPanel.colAdmin')}</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.orgsPanel.colCreated')}</th>
                    <th className="text-right p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.orgsPanel.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {organizations.map((org) => (
                    <tr key={org.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary-light rounded-xl flex items-center justify-center">
                            <Building2 size={20} className="text-primary" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{org.name}</p>
                            {org.address && <p className="text-xs text-slate-500">{org.address}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold inline-block w-fit ${getStatusBadge(org.subscriptionStatus || 'ACTIVE')}`}>
                          {tStatus('subscription', org.subscriptionStatus || 'ACTIVE')}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-bold text-slate-700">{org.userCount || 0}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm text-slate-600">{org.adminEmail || '-'}</span>
                          {org.adminEmail && (
                            org.adminVerified ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                                <CheckCircle2 size={12} /> {t('shell.orgsPanel.verified')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                                <Clock size={12} /> {t('shell.orgsPanel.pendingVerification')}
                              </span>
                            )
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-slate-500">
                          {org.created ? new Date(org.created).toLocaleDateString() : '-'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewUsers(org)}
                            className="p-2 hover:bg-blue-100 rounded-xl transition-all"
                            title={t('shell.orgsPanel.tooltipViewUsers')}
                          >
                            <Eye size={18} className="text-blue-600" />
                          </button>
                          <button
                            onClick={() => openEditMode(org)}
                            className="p-2 hover:bg-amber-100 rounded-xl transition-all"
                            title={t('shell.orgsPanel.tooltipEdit')}
                          >
                            <Edit size={18} className="text-amber-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'organizations' && viewMode === 'edit' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6">
            {t('shell.form.editTitle', { name: selectedOrg?.name })}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.form.orgName')}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-primary-light outline-none"
                placeholder={t('shell.form.orgNamePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.form.subscriptionStatus')}</label>
              <select
                value={formData.subscriptionStatus}
                onChange={(e) => setFormData({ ...formData, subscriptionStatus: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-primary-light outline-none"
              >
                <option value="ACTIVE">{t('shell.form.statusActive')}</option>
                <option value="EXPIRED">{t('shell.form.statusExpired')}</option>
                <option value="SUSPENDED">{t('shell.form.statusSuspended')}</option>
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.form.address')}</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-primary-light outline-none"
                placeholder={t('shell.form.addressPlaceholder')}
              />
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-slate-100">
            <button
              onClick={() => { setViewMode('list'); setSelectedOrg(null); }}
              className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
            >
              {t('shell.form.cancel')}
            </button>
            <button
              onClick={handleUpdateOrg}
              disabled={isLoading}
              className="px-6 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:bg-primary-hover transition-all disabled:opacity-50"
            >
              <Save size={18} />
              {t('shell.form.save')}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'organizations' && viewMode === 'users' && selectedOrg && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">
              {t('shell.users.title', { name: selectedOrg.name })}
            </h2>
            <p className="text-sm text-slate-500">{t('shell.users.count', { count: orgUsers.length })}</p>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-slate-500">{t('shell.users.loading')}</div>
          ) : orgUsers.length === 0 ? (
            <div className="p-12 text-center text-slate-500">{t('shell.users.empty')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.users.colUser')}</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.users.colRole')}</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.users.colDepartment')}</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.orgsPanel.colStatus')}</th>
                    <th className="text-right p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('shell.orgsPanel.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orgUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                            {u.avatar ? (
                              <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                              <Users size={20} className="text-slate-400" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{u.name}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : u.role === 'HR' ? 'bg-blue-100 text-blue-700' : u.role === 'MANAGER' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                          {tRole(u.role)}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-slate-600">{u.department}</span>
                      </td>
                      <td className="p-4">
                        {(u as Employee & { verified?: boolean }).verified ? (
                          <span className="text-emerald-600 flex items-center gap-1 text-sm">
                            <CheckCircle2 size={14} /> {t('shell.users.verified')}
                          </span>
                        ) : (
                          <span className="text-amber-600 flex items-center gap-1 text-sm">
                            <Clock size={14} /> {t('shell.users.pending')}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          {!(u as Employee & { verified?: boolean }).verified && (
                            <button
                              onClick={() => handleVerifyUser(u.id)}
                              className="p-2 hover:bg-emerald-100 rounded-xl transition-all"
                              title={t('shell.users.tooltipVerify')}
                            >
                              <UserCheck size={18} className="text-emerald-600" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(u.id, u.name)}
                            className="p-2 hover:bg-red-100 rounded-xl transition-all"
                            title={t('shell.users.tooltipDelete')}
                          >
                            <Trash2 size={18} className="text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SuperAdmin;
