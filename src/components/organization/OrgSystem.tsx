import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Moon, MapPin, Building2, Tag, Scale, Landmark, Radio } from 'lucide-react';
import { AppConfig, PtrpPolicy, EsocialAmbiente } from '../../types';
import { COUNTRIES, getFlagEmoji } from '../../data/countries';
import { TIMEZONE_OPTIONS, DEFAULT_PTRP_POLICY } from '../../constants';
import { apiClient } from '../../services/api.client';
import { supabase } from '../../services/supabase';
import { convertFileToWebP } from '../../utils/imageConvert';
import { normalizeCnpj, validateCnpj, formatCnpjDisplay } from '../../utils/employerCredentials';
import { useToast } from '../../context/ToastContext';
import { ClockEmployeeGuide } from '../employees/ClockEmployeeGuide';
import { OrgEsocialRubrics } from './OrgEsocialRubrics';

interface Props {
  config: AppConfig;
  onSave: (config: AppConfig) => Promise<void>;
  /** Full system owner controls (PTRP policy, DMPREP). HR sees operational org branding only. */
  canEditSystemPolicy?: boolean;
}

export const OrgSystem: React.FC<Props> = ({ config, onSave, canEditSystemPolicy = true }) => {
  const { t } = useTranslation('org');
  const { showToast } = useToast();
  const [orgData, setOrgData] = useState({
    name: '',
    country: 'BR',
    address: '',
    logo: '',
    cnpj: '',
    legalName: '',
    esocialAmbiente: 'PRODUCAO_RESTRITA' as EsocialAmbiente,
    payrollContactEmail: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadOrgData = async () => {
      const orgId = apiClient.getOrganizationId();
      if (!orgId) return;
      const { data: org, error } = await supabase
        .from('organizations')
        .select('name, country, address, logo, cnpj, legal_name, esocial_ambiente, payroll_contact_email')
        .eq('id', orgId)
        .maybeSingle();
      if (error || !org) return;
      setOrgData({
        name: org.name || '',
        country: org.country || 'BR',
        address: org.address || '',
        logo: org.logo || '',
        cnpj: org.cnpj ? formatCnpjDisplay(org.cnpj) : '',
        legalName: org.legal_name || '',
        esocialAmbiente: (org.esocial_ambiente as EsocialAmbiente) || 'PRODUCAO_RESTRITA',
        payrollContactEmail: org.payroll_contact_email || '',
      });
      if (org.logo) {
        const { data } = supabase.storage.from('org-logos').getPublicUrl(org.logo);
        setLogoPreview(data.publicUrl);
      }
    };
    loadOrgData();
  }, []);

  const handleChange = (key: keyof AppConfig, value: any) => {
    onSave({ ...config, [key]: value });
  };

  const ptrpPolicy: PtrpPolicy = config.ptrpPolicy ?? DEFAULT_PTRP_POLICY;

  const handlePtrpChange = (key: keyof PtrpPolicy, value: boolean | number) => {
    handleChange('ptrpPolicy', { ...ptrpPolicy, [key]: value });
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast(t('logoSizeError'), 'error');
        return;
      }
      if (!file.type.startsWith('image/')) {
        showToast(t('logoTypeError'), 'error');
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOrgDataSave = async () => {
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return;
    setIsSaving(true);
    try {
      const cnpjNorm = normalizeCnpj(orgData.cnpj);
      if (cnpjNorm && !validateCnpj(cnpjNorm).ok) {
        showToast(t('cnpjInvalid'), 'error');
        return;
      }
      let logoPath = orgData.logo;
      if (logoFile) {
        const webpLogo = await convertFileToWebP(logoFile);
        const fileName = `${orgId}/logo.webp`;
        const { error: uploadError } = await supabase.storage
          .from('org-logos')
          .upload(fileName, webpLogo, { upsert: true, contentType: 'image/webp' });
        if (uploadError) throw uploadError;
        logoPath = fileName;
      }
      const { error } = await supabase
        .from('organizations')
        .update({
          name: orgData.name,
          country: orgData.country,
          address: orgData.address,
          logo: logoPath,
          cnpj: cnpjNorm || null,
          legal_name: orgData.legalName.trim() || null,
          esocial_ambiente: orgData.esocialAmbiente,
          payroll_contact_email: orgData.payrollContactEmail.trim() || null,
        })
        .eq('id', orgId);
      if (error) throw error;
      showToast(t('orgUpdatedSuccess'), 'success');
    } catch (err) {
      console.error('Failed to update organization:', err);
      showToast(t('orgUpdateFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Organization Identity Section */}
      <div className="bg-white p-10 rounded-xl border border-slate-100 shadow-sm space-y-8 animate-in slide-in-from-bottom-8 duration-500">
         <div className="flex items-center justify-between">
           <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-3"><Building2 size={24} className="text-primary" /> {t('organizationIdentity')}</h3>
           <button
             onClick={handleOrgDataSave}
             disabled={isSaving}
             className="px-6 py-2 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-hover transition-all disabled:opacity-50"
           >
             {isSaving ? t('saving') : t('saveOrganization')}
           </button>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('organizationName')}</label>
               <input
                 type="text"
                 className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-50 transition-all outline-none"
                 placeholder={t('enterOrgName')}
                 value={orgData.name}
                 onChange={e => setOrgData({ ...orgData, name: e.target.value })}
               />
            </div>

            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('country')}</label>
               <select
                 className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-50 transition-all appearance-none"
                 value={orgData.country}
                 onChange={e => setOrgData({ ...orgData, country: e.target.value })}
               >
                 {COUNTRIES.map(country => (
                   <option key={country.code} value={country.code}>
                     {getFlagEmoji(country.code)} {country.name}
                   </option>
                 ))}
               </select>
            </div>

            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('organizationLogo')}</label>
               <div className="flex gap-4 items-center">
                 <input
                   type="file"
                   accept="image/*"
                   onChange={handleLogoChange}
                   className="flex-1 px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-50 transition-all file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200"
                 />
                 {logoPreview && (
                   <img src={logoPreview} alt={t('logoAlt')} className="h-12 w-12 object-contain rounded-xl border-2 border-blue-100" />
                 )}
               </div>
            </div>

            <div className="space-y-1 md:col-span-2">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('address')}</label>
               <div className="relative">
                 <MapPin className="absolute left-5 top-5 text-slate-300" size={18} />
                 <textarea
                   className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-50 transition-all resize-none"
                   rows={2}
                   placeholder={t('orgAddressPlaceholder')}
                   value={orgData.address}
                   onChange={e => setOrgData({ ...orgData, address: e.target.value })}
                 />
               </div>
            </div>
         </div>
      </div>

      {canEditSystemPolicy && (
      <div className="bg-white p-10 rounded-xl border border-slate-100 shadow-sm space-y-8 animate-in slide-in-from-bottom-8 duration-500">
         <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-3"><Landmark size={24} className="text-primary" /> {t('esocialEmployer')}</h3>
         <p className="text-xs text-slate-400 -mt-4">{t('esocialEmployerHint')}</p>
         <div className="flex justify-end -mt-2">
           <button type="button" onClick={() => void handleOrgDataSave()} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-xl font-bold text-xs disabled:opacity-50">
             {isSaving ? t('saving') : t('saveOrganization')}
           </button>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('cnpj')}</label>
               <input type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-50 transition-all outline-none" placeholder={t('cnpjPlaceholder')} value={orgData.cnpj} onChange={e => setOrgData({ ...orgData, cnpj: e.target.value })} />
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('legalName')}</label>
               <input type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-50 transition-all outline-none" placeholder={t('legalNamePlaceholder')} value={orgData.legalName} onChange={e => setOrgData({ ...orgData, legalName: e.target.value })} />
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('esocialAmbiente')}</label>
               <select className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-50 transition-all" value={orgData.esocialAmbiente} onChange={e => setOrgData({ ...orgData, esocialAmbiente: e.target.value as EsocialAmbiente })}>
                  <option value="PRODUCAO_RESTRITA">{t('esocialAmbienteRestrita')}</option>
                  <option value="PRODUCAO">{t('esocialAmbienteProducao')}</option>
               </select>
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('payrollContactEmail')}</label>
               <input type="email" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-50 transition-all outline-none" placeholder={t('payrollContactEmailPlaceholder')} value={orgData.payrollContactEmail} onChange={e => setOrgData({ ...orgData, payrollContactEmail: e.target.value })} />
            </div>
         </div>
      </div>
      )}

      {/* System Configuration Section */}
      <div className="bg-white p-10 rounded-xl border border-slate-100 shadow-sm space-y-8 animate-in slide-in-from-bottom-8 duration-500">
         <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-3"><Globe size={24} className="text-primary" /> {t('systemConfiguration')}</h3>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('timezone')}</label>
               <select className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-50 transition-all" value={config.timezone} onChange={e => handleChange('timezone', e.target.value)}>
                  {TIMEZONE_OPTIONS.map(group => (
                    <optgroup key={group.group} label={group.group}>
                      {group.zones.map(zone => (
                        <option key={zone.value} value={zone.value}>{zone.label}</option>
                      ))}
                    </optgroup>
                  ))}
               </select>
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('currency')}</label>
               <input type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-50 transition-all outline-none" value={config.currency} onChange={e => handleChange('currency', e.target.value)} />
            </div>
         </div>

         <div className="pt-8 border-t border-slate-50">
             <div className="grid grid-cols-1 gap-6">
               <div className="space-y-4 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                   <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-2"><Moon size={16} className="text-indigo-500"/> {t('autoAbsentAutomation')}</h4>
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500">{t('enableFeature')}</span>
                      <input type="checkbox" className="w-5 h-5 accent-indigo-600 rounded-lg" checked={config.autoAbsentEnabled || false} onChange={e => handleChange('autoAbsentEnabled', e.target.checked)} />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">{t('cutoffTime')}</label>
                      <input type="time" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none" value={config.autoAbsentTime || '23:55'} onChange={e => handleChange('autoAbsentTime', e.target.value)} />
                      <p className="text-[9px] text-slate-400 mt-1">{t('autoAbsentHint')}</p>
                   </div>
               </div>
             </div>
         </div>
      </div>

      {/* PTRP Policy Section — Admin only */}
      {canEditSystemPolicy && (
      <div className="bg-white p-10 rounded-xl border border-slate-100 shadow-sm space-y-8 animate-in slide-in-from-bottom-8 duration-500">
         <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-3"><Scale size={24} className="text-primary" /> {t('ptrpPolicy')}</h3>
         <p className="text-xs text-slate-400 -mt-4">{t('ptrpPolicyHint')}</p>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 p-6 bg-slate-50 rounded-[2rem] border border-slate-100 md:col-span-2">
               <label className="flex items-start justify-between gap-4 cursor-pointer">
                  <div className="space-y-1">
                     <span className="block text-sm font-bold text-slate-800">{t('bankEnabled')}</span>
                     <span className="block text-xs text-slate-500 leading-relaxed">{t('bankEnabledDesc')}</span>
                  </div>
                  <input type="checkbox" className="mt-1 w-5 h-5 accent-primary rounded-lg shrink-0" checked={ptrpPolicy.bankEnabled} onChange={e => handlePtrpChange('bankEnabled', e.target.checked)} />
               </label>
               <div className={`rounded-2xl px-4 py-3 text-xs font-medium leading-relaxed border ${ptrpPolicy.bankEnabled ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                  {ptrpPolicy.bankEnabled ? t('bankEnabledOnHint') : t('bankEnabledOffHint')}
               </div>
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('periodStartDay')}</label>
               <input type="number" min={1} max={28} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-50 transition-all outline-none" value={ptrpPolicy.periodStartDay} onChange={e => handlePtrpChange('periodStartDay', Math.min(28, Math.max(1, Number(e.target.value) || 1)))} />
               <p className="text-[9px] text-slate-400 mt-1 px-1">{t('periodStartDayHint')}</p>
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('weeklyOtThresholdMinutes')}</label>
               <input type="number" min={0} step={15} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-50 transition-all outline-none" value={ptrpPolicy.weeklyOtThresholdMinutes} onChange={e => handlePtrpChange('weeklyOtThresholdMinutes', Math.max(0, Number(e.target.value) || 0))} />
               <p className="text-[9px] text-slate-400 mt-1 px-1">{t('weeklyOtThresholdHint')}</p>
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('defaultBreakMinutes')}</label>
               <input type="number" min={0} step={5} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-50 transition-all outline-none" value={ptrpPolicy.defaultBreakMinutes} onChange={e => handlePtrpChange('defaultBreakMinutes', Math.max(0, Number(e.target.value) || 0))} />
               <p className="text-[9px] text-slate-400 mt-1 px-1">{t('defaultBreakHint')}</p>
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('clockStartDate')}</label>
               <input type="date" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-50 transition-all outline-none" value={config.timesheetClockStartDate || ''} onChange={e => handleChange('timesheetClockStartDate', e.target.value || undefined)} />
               <p className="text-[9px] text-slate-400 mt-1 px-1">{t('clockStartDateHint')}</p>
            </div>
         </div>
      </div>
      )}

      {/* Duty Type Labels Section */}
      <div className="bg-white p-10 rounded-xl border border-slate-100 shadow-sm space-y-8 animate-in slide-in-from-bottom-8 duration-500">
         <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-3"><Tag size={24} className="text-primary" /> {t('dutyTypeLabels')}</h3>
         <p className="text-xs text-slate-400 -mt-4">{t('dutyTypeLabelsHint')}</p>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('dutyType1')}</label>
               <input type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-50 transition-all outline-none" value={config.dutyLabel1 || t('dutyType1Placeholder')} onChange={e => handleChange('dutyLabel1', e.target.value)} placeholder={t('dutyType1Placeholder')} />
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('dutyType2')}</label>
               <input type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-50 transition-all outline-none" value={config.dutyLabel2 || t('dutyType2Placeholder')} onChange={e => handleChange('dutyLabel2', e.target.value)} placeholder={t('dutyType2Placeholder')} />
            </div>
         </div>
      </div>

      {canEditSystemPolicy && (
        <ClockEmployeeGuide mode="reference" defaultExpanded />
      )}

      {canEditSystemPolicy && (
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
            <Radio size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">{t('clockConsoleShortcut.title')}</h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              {t('clockConsoleShortcut.description')}
            </p>
            <p className="text-xs text-slate-500 mt-2">{t('clockConsoleShortcut.hint')}</p>
          </div>
        </div>
      )}

      {canEditSystemPolicy && <OrgEsocialRubrics />}
    </div>
  );
};
