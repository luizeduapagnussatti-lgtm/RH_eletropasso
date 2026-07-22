import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Heart, Clock, Monitor, ArrowLeft, ExternalLink, Upload,
  CheckCircle2, AlertCircle, Loader2, Coffee, X
} from 'lucide-react';
import { upgradeService } from '../services/upgrade.service';
import { useSubscription } from '../context/SubscriptionContext';
import { DonationTier, UpgradeRequest } from '../types';
import { APP_NAME } from '../config/branding';

interface UpgradeProps {
  onBack: () => void;
}

const DONATION_TIER_IDS: { id: DonationTier; label: string; amount: number }[] = [
  { id: 'TIER_3MO', label: '$5', amount: 5 },
  { id: 'TIER_6MO', label: '$10', amount: 10 },
  { id: 'TIER_1YR', label: '$20', amount: 20 },
  { id: 'TIER_LIFETIME', label: '$50', amount: 50 }
];

const EXTENSION_REASON_KEYS = [
  'evaluating',
  'budget',
  'setup',
  'training',
  'nonprofit',
  'education',
  'other'
] as const;

const Upgrade: React.FC<UpgradeProps> = ({ onBack }) => {
  const { t } = useTranslation('subscription');
  const { subscription, refreshSubscription } = useSubscription();
  const [activeTab, setActiveTab] = useState<'donate' | 'extend' | 'ads'>('donate');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingRequest, setPendingRequest] = useState<UpgradeRequest | null>(null);

  // Donation form state
  const [selectedTier, setSelectedTier] = useState<DonationTier>('TIER_6MO');
  const [donationRef, setDonationRef] = useState('');
  const [donationFile, setDonationFile] = useState<File | null>(null);
  const [showDonationForm, setShowDonationForm] = useState(false);

  // Extension form state
  const [extensionReason, setExtensionReason] = useState('');
  const [extensionDays, setExtensionDays] = useState(14);
  const [customReason, setCustomReason] = useState('');

  // Check for pending request on load
  useEffect(() => {
    const checkPending = async () => {
      const pending = await upgradeService.getPendingRequest();
      setPendingRequest(pending);
    };
    checkPending();
  }, []);

  const handleDonationSubmit = async () => {
    if (!donationRef.trim()) {
      setMessage({ type: 'error', text: t('errors.transactionRefRequired') });
      return;
    }

    const tier = DONATION_TIER_IDS.find(item => item.id === selectedTier);
    if (!tier) return;

    setIsLoading(true);
    const result = await upgradeService.submitDonationRequest({
      donationTier: selectedTier,
      donationAmount: tier.amount,
      donationReference: donationRef,
      donationScreenshot: donationFile || undefined
    });

    setIsLoading(false);
    if (result.success) {
      setMessage({ type: 'success', text: t('success.donationSubmitted') });
      setShowDonationForm(false);
      const pending = await upgradeService.getPendingRequest();
      setPendingRequest(pending);
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  const handleExtensionSubmit = async () => {
    const reason =
      extensionReason === 'other'
        ? customReason
        : t(`reasons.${extensionReason}`);
    if (!reason.trim()) {
      setMessage({ type: 'error', text: t('errors.reasonRequired') });
      return;
    }

    setIsLoading(true);
    const result = await upgradeService.submitExtensionRequest({
      extensionReason: reason,
      extensionDays
    });

    setIsLoading(false);
    if (result.success) {
      setMessage({ type: 'success', text: t('success.extensionSubmitted') });
      const pending = await upgradeService.getPendingRequest();
      setPendingRequest(pending);
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  const handleAcceptAds = async () => {
    setIsLoading(true);
    const result = await upgradeService.acceptAdSupported();

    setIsLoading(false);
    if (result.success) {
      setMessage({ type: 'success', text: t('success.adsActivated') });
      await refreshSubscription();
      setTimeout(() => onBack(), 2000);
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  // If user already has active subscription, show message
  if (subscription?.status === 'ACTIVE') {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-emerald-800 mb-2">{t('allSetTitle')}</h2>
          <p className="text-emerald-600 mb-6">{t('allSetBody')}</p>
          <button onClick={onBack} className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all">
            {t('backToDashboard')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
          <ArrowLeft size={24} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('upgradeTitle')}</h1>
          <p className="text-slate-500">{t('upgradeSubtitle', { appName: APP_NAME })}</p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto p-1 hover:bg-white/50 rounded">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Pending Request Notice */}
      {pendingRequest && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <Clock className="w-6 h-6 text-amber-600 mt-1" />
            <div>
              <h3 className="font-bold text-amber-800">{t('pendingTitle')}</h3>
              <p className="text-amber-700 text-sm mt-1">
                {pendingRequest.requestType === 'DONATION'
                  ? t('pendingBodyActivation', { date: new Date(pendingRequest.created || '').toLocaleDateString() })
                  : t('pendingBodyExtension', { date: new Date(pendingRequest.created || '').toLocaleDateString() })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Intro Banner */}
      <div className="bg-gradient-to-br from-primary to-primary-hover rounded-2xl p-8 text-white">
        <div className="flex items-center gap-3 mb-4">
          <Heart className="w-8 h-8" />
          <h2 className="text-xl font-bold">{t('introTitle')}</h2>
        </div>
        <p className="text-white/90">
          {t('introBody', { appName: APP_NAME })}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
        <button
          onClick={() => setActiveTab('donate')}
          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === 'donate' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Heart size={18} /> {t('tabs.donate')}
        </button>
        <button
          onClick={() => setActiveTab('extend')}
          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === 'extend' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock size={18} /> {t('tabs.extend')}
        </button>
        <button
          onClick={() => setActiveTab('ads')}
          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === 'ads' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Monitor size={18} /> {t('tabs.ads')}
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Donation Tab */}
        {activeTab === 'donate' && (
          <div className="p-8 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{t('donateTitle')}</h3>
              <p className="text-slate-500">
                {t('donateSubtitle')}
              </p>
            </div>

            {/* Donation Tiers */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {DONATION_TIER_IDS.map(tier => (
                <button
                  key={tier.id}
                  onClick={() => setSelectedTier(tier.id)}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    selectedTier === tier.id
                      ? 'border-primary bg-primary-light'
                      : 'border-slate-200 hover:border-primary-light'
                  }`}
                >
                  <div className="text-2xl font-bold text-slate-900">{tier.label}</div>
                  <div className="text-sm text-slate-500">{t(`tiers.${tier.id}`)}</div>
                </button>
              ))}
            </div>

            {/* Donation Platforms */}
            <div className="space-y-4">
              <p className="text-sm font-medium text-slate-600">{t('donateVia')}</p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="https://ko-fi.com/openhr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-3 bg-[#FF5E5B] text-white rounded-xl font-bold hover:opacity-90 transition-all"
                >
                  <Coffee size={20} /> {t('platformKofi')}
                  <ExternalLink size={14} />
                </a>
                <a
                  href="https://www.buymeacoffee.com/openhr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-3 bg-[#FFDD00] text-slate-900 rounded-xl font-bold hover:opacity-90 transition-all"
                >
                  <Coffee size={20} /> {t('platformBuyMeACoffee')}
                  <ExternalLink size={14} />
                </a>
                <a
                  href="https://paypal.me/openhr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-3 bg-[#003087] text-white rounded-xl font-bold hover:opacity-90 transition-all"
                >
                  {t('platformPaypal')}
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>

            {/* Activation Form */}
            {!showDonationForm ? (
              <button
                onClick={() => setShowDonationForm(true)}
                className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-600 font-medium hover:border-primary hover:text-primary transition-all"
              >
                {t('alreadyDonated')}
              </button>
            ) : (
              <div className="space-y-4 p-6 bg-slate-50 rounded-xl">
                <h4 className="font-bold text-slate-900">{t('activationFormTitle')}</h4>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">{t('transactionRef')}</label>
                  <input
                    type="text"
                    value={donationRef}
                    onChange={(e) => setDonationRef(e.target.value)}
                    placeholder={t('transactionRefPlaceholder')}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-light outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">{t('screenshotOptional')}</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                      <Upload size={18} />
                      <span className="text-sm">{donationFile ? donationFile.name : t('chooseFile')}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setDonationFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                    </label>
                    {donationFile && (
                      <button onClick={() => setDonationFile(null)} className="text-red-500 text-sm">
                        {t('removeFile')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDonationForm(false)}
                    className="px-6 py-3 border border-slate-200 rounded-xl font-medium hover:bg-slate-100 transition-all"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={handleDonationSubmit}
                    disabled={isLoading || !donationRef.trim()}
                    className="flex-1 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading && <Loader2 size={18} className="animate-spin" />}
                    {t('submitActivation')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Extension Tab */}
        {activeTab === 'extend' && (
          <div className="p-8 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{t('extendTitle')}</h3>
              <p className="text-slate-500">
                {t('extendSubtitle')}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">{t('extendReasonLabel')}</label>
                <select
                  value={extensionReason}
                  onChange={(e) => setExtensionReason(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-light outline-none"
                >
                  <option value="">{t('extendReasonPlaceholder')}</option>
                  {EXTENSION_REASON_KEYS.map(key => (
                    <option key={key} value={key}>{t(`reasons.${key}`)}</option>
                  ))}
                </select>
              </div>

              {extensionReason === 'other' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">{t('extendSpecifyLabel')}</label>
                  <textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder={t('extendSpecifyPlaceholder')}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-light outline-none resize-none"
                    rows={3}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">{t('extensionPeriod')}</label>
                <div className="flex gap-3">
                  {[7, 14, 30].map(days => (
                    <button
                      key={days}
                      onClick={() => setExtensionDays(days)}
                      className={`flex-1 py-3 rounded-xl border-2 font-bold transition-all ${
                        extensionDays === days
                          ? 'border-primary bg-primary-light text-primary'
                          : 'border-slate-200 text-slate-600 hover:border-primary-light'
                      }`}
                    >
                      {t('daysCount', { count: days })}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleExtensionSubmit}
                disabled={isLoading || !extensionReason || (extensionReason === 'other' && !customReason.trim())}
                className="w-full py-4 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading && <Loader2 size={18} className="animate-spin" />}
                {t('submitExtension')}
              </button>
            </div>
          </div>
        )}

        {/* Ad-Supported Tab */}
        {activeTab === 'ads' && (
          <div className="p-8 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{t('adsTitle')}</h3>
              <p className="text-slate-500">
                {t('adsSubtitle')}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 space-y-4">
              <h4 className="font-bold text-slate-800">{t('adsExpectTitle')}</h4>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                  <span className="text-slate-600">{t('adsExpect1')}</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                  <span className="text-slate-600">{t('adsExpect2')}</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                  <span className="text-slate-600">{t('adsExpect3')}</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                  <span className="text-slate-600">{t('adsExpect4')}</span>
                </li>
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              <strong>{t('adsNoteLabel')}</strong> {t('adsNote')}
            </div>

            <button
              onClick={handleAcceptAds}
              disabled={isLoading}
              className="w-full py-4 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 size={18} className="animate-spin" />}
              {t('acceptAds')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Upgrade;
