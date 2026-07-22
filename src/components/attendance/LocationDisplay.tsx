
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation, Trans } from 'react-i18next';
import { MapPin, RefreshCw, AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  location: { lat: number; lng: number; address: string } | null;
  isLocating: boolean;
  error?: string | null;
  onRetry: () => void;
}

const LocationHelpGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation('attendance');
  return (
  <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
    <div
      className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
      onClick={e => e.stopPropagation()}
    >
      <div className="sticky top-0 bg-white rounded-t-3xl px-6 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">{t('locationHelpTitle')}</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
          <X size={14} className="text-slate-500" />
        </button>
      </div>

      <div className="px-6 py-4 space-y-5 text-xs text-slate-600 leading-relaxed">
        <div>
          <p className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-2">{t('locationHelpAndroidTitle')}</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li><Trans i18nKey="attendance:locationHelpAndroid1" components={{ strong: <strong /> }} /></li>
            <li><Trans i18nKey="attendance:locationHelpAndroid2" components={{ strong: <strong /> }} /></li>
            <li><Trans i18nKey="attendance:locationHelpAndroid3" components={{ strong: <strong /> }} /></li>
            <li><Trans i18nKey="attendance:locationHelpAndroid4" components={{ strong: <strong /> }} /></li>
            <li><Trans i18nKey="attendance:locationHelpAndroid5" components={{ strong: <strong /> }} /></li>
          </ol>
        </div>

        <div>
          <p className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-2">{t('locationHelpIosTitle')}</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li><Trans i18nKey="attendance:locationHelpIos1" components={{ strong: <strong /> }} /></li>
            <li><Trans i18nKey="attendance:locationHelpIos2" components={{ strong: <strong /> }} /></li>
            <li><Trans i18nKey="attendance:locationHelpIos3" components={{ strong: <strong /> }} /></li>
            <li><Trans i18nKey="attendance:locationHelpIos4" components={{ strong: <strong /> }} /></li>
          </ol>
        </div>

        <div>
          <p className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-2">{t('locationHelpDesktopTitle')}</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li><Trans i18nKey="attendance:locationHelpDesktop1" components={{ strong: <strong /> }} /></li>
            <li><Trans i18nKey="attendance:locationHelpDesktop2" components={{ strong: <strong /> }} /></li>
            <li><Trans i18nKey="attendance:locationHelpDesktop3" components={{ strong: <strong /> }} /></li>
          </ol>
        </div>

        <p className="text-[10px] text-slate-400 pt-2 border-t border-slate-100">
          {t('locationHelpTip')}
        </p>
      </div>
    </div>
  </div>
  );
};

export const LocationDisplay: React.FC<Props> = ({ location, isLocating, error, onRetry }) => {
  const { t } = useTranslation('attendance');
  const [showHelp, setShowHelp] = useState(false);
  const [showError, setShowError] = useState(true);

  if (location && !error) {
    return (
      <div className="mt-3 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl flex items-center gap-1.5 pointer-events-auto cursor-pointer" onClick={onRetry}>
        <MapPin size={10} className="text-rose-400" />
        <span className="text-[8px] font-semibold text-white uppercase tracking-wider">
          {location.address}
        </span>
      </div>
    );
  }

  if (isLocating) {
    return (
      <div className="mt-3 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl flex items-center gap-1.5">
        <RefreshCw size={10} className="text-blue-400 animate-spin" />
        <span className="text-[8px] font-semibold text-white uppercase tracking-wider">
          {t('detectingLocation')}
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="mt-3 flex flex-col items-center gap-1.5 pointer-events-auto">
        {error && showError && (
          <div className="px-3 py-2 bg-red-500/90 backdrop-blur-md rounded-xl max-w-[240px]">
            <div className="flex items-start gap-1.5">
              <AlertTriangle size={10} className="text-white mt-0.5 shrink-0" />
              <span className="text-[7px] font-medium text-white leading-tight">
                {error.startsWith('errors.') ? t(error) : error}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button
            onClick={onRetry}
            className="px-3 py-1.5 bg-blue-500/90 backdrop-blur-md rounded-xl flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <RefreshCw size={9} className="text-white" />
            <span className="text-[8px] font-semibold text-white uppercase tracking-wider">
              {t('retryLocation')}
            </span>
          </button>

          <button
            onClick={() => setShowHelp(true)}
            className="px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-xl flex items-center gap-1"
          >
            <span className="text-[8px] font-semibold text-white/80 uppercase tracking-wider">
              {t('help')}
            </span>
          </button>

          {error && (
            <button
              onClick={() => setShowError(!showError)}
              className="w-6 h-6 bg-white/10 backdrop-blur-md rounded-lg flex items-center justify-center"
            >
              {showError ? <ChevronUp size={10} className="text-white/60" /> : <ChevronDown size={10} className="text-white/60" />}
            </button>
          )}
        </div>
      </div>

      {showHelp && createPortal(
        <LocationHelpGuide onClose={() => setShowHelp(false)} />,
        document.body
      )}
    </>
  );
};
