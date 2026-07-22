
import React, { useState, useEffect } from 'react';
import {
  User, ArrowLeft, Save, RefreshCw, Mail, UserCheck, Hash, Lock, Key, Eye, EyeOff,
  Send, Loader2, CheckCircle, AlertCircle, MessageSquare, Clock, Users, UserPlus, ExternalLink
} from 'lucide-react';
import { hrService } from '../services/hrService';
import { User as UserType, Employee, Shift } from '../types';
import { ThemeSelector } from '../components/settings/ThemeSelector';
import { LanguageSelector } from '../components/settings/LanguageSelector';
import { useTranslation } from 'react-i18next';
import { AdminVerificationPanel } from '../components/admin/AdminVerificationPanel';
import HelpButton from '../components/onboarding/HelpButton';
import { ReEnableSetupGuide } from '../components/onboarding/SetupChecklist';
import { contactService } from '../services/contact.service';
import { useToast } from '../context/ToastContext';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config/branding';

interface SettingsProps {
  user: UserType;
  onBack?: () => void;
  onNavigate?: (path: string) => void;
}

const ProfileSkeleton = () => (
  <div className="max-w-3xl animate-pulse">
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 space-y-8">
      <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
        <div className="w-20 h-20 bg-slate-100 rounded-xl"></div>
        <div className="space-y-2 flex-1">
          <div className="h-6 bg-slate-100 rounded-lg w-1/3"></div>
          <div className="h-4 bg-slate-50 rounded-lg w-1/4"></div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 bg-slate-50 rounded w-1/4 ml-1"></div>
            <div className="h-14 bg-slate-50 border border-slate-100 rounded-2xl w-full"></div>
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-4">
        <div className="h-14 bg-slate-100 rounded-xl w-40"></div>
      </div>
    </div>
  </div>
);

const Settings: React.FC<SettingsProps> = ({ user, onBack, onNavigate }) => {
  const { t } = useTranslation('settings');
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Partial<Employee> & { managerName?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Contact Form State
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [isContactSubmitting, setIsContactSubmitting] = useState(false);
  const [contactResult, setContactResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [contactInitialized, setContactInitialized] = useState(false);

  const isAdmin = user.role === 'ADMIN';
  const canProvisionUsers = user.role === 'ADMIN' || user.role === 'HR';
  const [myShift, setMyShift] = useState<Shift | null>(null);
  const [myTeamName, setMyTeamName] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [employees, shifts, teams] = await Promise.all([
          hrService.getEmployees(),
          hrService.getShifts(),
          hrService.getTeams()
        ]);
        const myData = employees.find(e => e.id === user.id);

        if (myData) {
          const manager = employees.find(e => e.id === myData.lineManagerId);
          setProfile({
            ...myData,
            email: myData.email || user.email,
            managerName: manager ? manager.name : undefined
          });

          // Resolve shift
          if (myData.shiftId) {
            const shift = shifts.find(s => s.id === myData.shiftId);
            setMyShift(shift || null);
          }

          // Resolve team
          if (myData.teamId) {
            const team = teams.find(t => t.id === myData.teamId);
            setMyTeamName(team ? team.name : null);
          } else {
            setMyTeamName(null);
          }
        } else {
          setProfile({
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            designation: user.designation,
            employeeId: user.employeeId,
          } as Partial<Employee> & { managerName?: string });
        }
      } catch (err) {
        console.error("Settings load failed:", err);
      }
    };
    load();
  }, [user.id, user.name, user.email, user.role, user.department, user.designation, user.employeeId]);

  // Pre-fill contact form with user info
  useEffect(() => {
    if (!contactInitialized && user.name && user.email) {
      setContactForm(prev => ({ ...prev, name: user.name || '', email: user.email || '' }));
      setContactInitialized(true);
    }
  }, [user.name, user.email, contactInitialized]);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactResult(null);

    if (!contactForm.message.trim()) {
      setContactResult({ type: 'error', message: t('enterMessage') });
      return;
    }

    setIsContactSubmitting(true);
    try {
      const response = await contactService.submitContactForm(contactForm);
      if (response.success) {
        setContactResult({ type: 'success', message: response.message });
        setContactForm(prev => ({ ...prev, subject: '', message: '' }));
      } else {
        setContactResult({ type: 'error', message: response.message });
      }
    } catch {
      setContactResult({ type: 'error', message: t('contactError') });
    } finally {
      setIsContactSubmitting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (profile) {
        const updatePayload: any = {
           name: profile.name,
           email: profile.email
        };

        if (newPassword) {
          if (!currentPassword) {
            showToast(t('enterCurrentPassword'), 'warning');
            setIsSaving(false);
            return;
          }
          if (newPassword.length < 8) {
            showToast(t('passwordMinLength'), 'warning');
            setIsSaving(false);
            return;
          }
          if (newPassword !== confirmPassword) {
            showToast(t('passwordsDontMatch'), 'warning');
            setIsSaving(false);
            return;
          }
          updatePayload.password = newPassword;
          updatePayload.oldPassword = currentPassword;
        }

        await hrService.updateProfile(user.id, updatePayload);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        showToast(t('profileUpdated'), 'success');
        window.location.reload();
      }
    } catch (e: any) {
      showToast(t('operationFailed', { message: e.message }), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {onBack && <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><ArrowLeft size={20} /></button>}
          <div>
            <div className="flex items-center gap-2"><h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('title')}</h1><HelpButton helpPointId="settings.profile" /></div>
            <p className="text-slate-500 font-medium">{t('profile')}</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl space-y-6">
        <LanguageSelector />
        <ThemeSelector />
      </div>

      {!profile ? (
        <ProfileSkeleton />
      ) : (
        <div className="max-w-3xl">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 space-y-8 animate-in slide-in-from-left-4">
            <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
              <div className="w-20 h-20 bg-primary-light rounded-xl flex items-center justify-center text-primary font-semibold text-2xl uppercase relative overflow-hidden">
                 {profile.avatar ? <img src={profile.avatar} className="w-full h-full object-cover" /> : profile.name?.[0]}
              </div>
              <div>
                 <h3 className="text-xl font-semibold text-slate-900">{profile.name}</h3>
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{profile.designation} • {profile.department}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('officialEmployeeId')}</label>
                <div className="relative">
                  <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input type="text" readOnly className="w-full pl-12 pr-4 py-4 bg-slate-100 border border-slate-200 rounded-2xl font-semibold text-sm text-slate-500 cursor-not-allowed" value={profile.employeeId || t('notAssigned')} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('reportingTo')}</label>
                <div className="relative">
                  <UserCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input type="text" readOnly className="w-full pl-12 pr-4 py-4 bg-slate-100 border border-slate-200 rounded-2xl font-semibold text-sm text-slate-500 cursor-not-allowed" value={profile.managerName || t('noDirectManager')} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('team')}</label>
                <div className="relative">
                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input type="text" readOnly className="w-full pl-12 pr-4 py-4 bg-slate-100 border border-slate-200 rounded-2xl font-semibold text-sm text-slate-500 cursor-not-allowed" value={myTeamName || t('noTeam')} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('assignedShift')}</label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input type="text" readOnly className="w-full pl-12 pr-4 py-4 bg-slate-100 border border-slate-200 rounded-2xl font-semibold text-sm text-slate-500 cursor-not-allowed" value={myShift ? `${myShift.name} (${myShift.startTime} - ${myShift.endTime})` : t('noShiftAssigned')} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('fullName')}</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input type="text" className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light" value={profile.name || ''} onChange={e => setProfile({...profile, name: e.target.value})} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('workEmail')}</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input type="email" className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light" value={profile.email || user.email || ''} onChange={e => setProfile({...profile, email: e.target.value})} />
                </div>
              </div>
            </div>

            {/* Password Section */}
            <div className="pt-6 border-t border-slate-50">
               <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-tight flex items-center gap-2 mb-4">
                  <Lock size={16} className="text-primary"/> {t('securitySettings')}
               </h4>
               <div className="space-y-1.5 mb-6">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('currentPassword')}</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder={t('currentPasswordPlaceholder')}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light"
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                      />
                    </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('newPassword')}</label>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input 
                        type={showPassword ? "text" : "password"} 
                        placeholder={t('newPasswordPlaceholder')}
                        className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light" 
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 p-1">
                        {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('confirmNewPassword')}</label>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input 
                        type={showPassword ? "text" : "password"} 
                        placeholder={t('confirmPasswordPlaceholder')}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light" 
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>
               </div>
            </div>

            <div className="flex justify-end pt-4">
              <button onClick={handleSave} disabled={isSaving} className="px-12 py-5 bg-primary text-white rounded-xl font-semibold uppercase text-xs tracking-widest shadow-xl transition-all flex items-center gap-3 hover:bg-primary-hover">
                {isSaving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />} 
                {t('updateMyInfo')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provision users — ADMIN/HR (not in profile form; goes to Equipe) */}
      {canProvisionUsers && onNavigate && (
        <div className="max-w-3xl animate-in slide-in-from-bottom-8">
          <h3 className="text-xl font-bold text-slate-900 tracking-tight mb-6 flex items-center gap-2">
            <UserPlus size={24} className="text-primary" /> {t('provisionUsersTitle')}
          </h3>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 space-y-4">
            <p className="text-sm text-slate-500 leading-relaxed">{t('provisionUsersHint')}</p>
            <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
              <li>{t('provisionStepOpenTeam')}</li>
              <li>{t('provisionStepAdd')}</li>
              <li>{t('provisionStepRole')}</li>
            </ol>
            <button
              type="button"
              onClick={() => onNavigate('employees')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-semibold uppercase text-xs tracking-widest shadow-lg hover:bg-primary-hover transition-all"
            >
              <ExternalLink size={16} /> {t('goToTeamDirectory')}
            </button>
          </div>
        </div>
      )}

      {/* Admin Verification Panel */}
      {isAdmin && (
        <div className="max-w-3xl animate-in slide-in-from-bottom-8">
          <h3 className="text-xl font-bold text-slate-900 tracking-tight mb-6 flex items-center gap-2">
            <UserCheck size={24} className="text-emerald-500" /> {t('adminTools')}
          </h3>
          <AdminVerificationPanel />
        </div>
      )}

      {/* Re-enable Setup Guide (only shown if dismissed) */}
      <ReEnableSetupGuide userRole={user.role} />

      {/* Contact Support */}
      <div className="max-w-3xl animate-in slide-in-from-bottom-8">
        <h3 className="text-xl font-bold text-slate-900 tracking-tight mb-6 flex items-center gap-2">
          <MessageSquare size={24} className="text-primary" /> {t('contactSupport')}
        </h3>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 space-y-6">
          <p className="text-sm text-slate-500">{t('contactIntro')}</p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{t('supportEmailLabel')}</span>
            <a
              href={SUPPORT_MAILTO}
              className="inline-flex items-center gap-2 text-primary font-bold text-sm hover:underline"
            >
              <Mail size={16} />
              {SUPPORT_EMAIL}
            </a>
          </div>
          <p className="text-xs text-slate-400">{t('contactFormReplyHint')}</p>
          <form onSubmit={handleContactSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('name')}</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input
                    type="text"
                    value={contactForm.name}
                    onChange={e => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('yourReplyEmail')}</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input
                    type="email"
                    value={contactForm.email}
                    onChange={e => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('subject')}</label>
              <input
                type="text"
                value={contactForm.subject}
                onChange={e => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                placeholder={t('subjectPlaceholder')}
                className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                {t('message')} <span className="text-red-400">*</span>
              </label>
              <textarea
                value={contactForm.message}
                onChange={e => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                placeholder={t('messagePlaceholder')}
                rows={4}
                className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light resize-none"
              />
            </div>

            {contactResult && (
              <div className={`flex items-start gap-3 p-4 rounded-2xl text-sm font-medium ${
                contactResult.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'bg-red-50 text-red-700 border border-red-100'
              }`}>
                {contactResult.type === 'success' ? <CheckCircle size={18} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />}
                <span>{contactResult.message}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isContactSubmitting}
                className="px-10 py-4 bg-primary text-white rounded-xl font-semibold uppercase text-xs tracking-widest shadow-xl transition-all flex items-center gap-3 hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isContactSubmitting ? (
                  <><Loader2 size={18} className="animate-spin" /> {t('sending')}</>
                ) : (
                  <><Send size={18} /> {t('sendMessage')}</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Settings;
