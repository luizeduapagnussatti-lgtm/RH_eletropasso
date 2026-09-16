import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, ArrowLeft, MapPin, Camera } from 'lucide-react';
import { useCamera } from '../hooks/attendance/useCamera';
import { useGeoLocation } from '../hooks/attendance/useGeoLocation';
import { useSubscription } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';
import { CameraFeed } from '../components/attendance/CameraFeed';
import { LocationDisplay } from '../components/attendance/LocationDisplay';
import { hrService } from '../services/hrService';
import { punchLocalDateKey } from '../services/punch.service';
import type { User } from '../types';
import { formatTime } from '../i18n/format';
import {
  clearMediaReadyMark,
  isSecureMediaContext,
  shouldShowMediaPermissionGate,
  writeMediaReadyMark,
} from '../utils/pwaMediaPermissions';

interface Props {
  user: User;
  onFinish?: () => void;
}

/**
 * PWA punch into `punches` (source=APP). Secondary to REP CLOCK.
 * Requires profiles.allow_pwa_punch + selfie + GPS.
 */
const PwaPunch: React.FC<Props> = ({ user, onFinish }) => {
  const { t } = useTranslation('attendance');
  const { showToast } = useToast();
  const { canPerformAction, subscription } = useSubscription();

  const [allowPwaPunch, setAllowPwaPunch] = useState<boolean>(!!user.allowPwaPunch);
  const [flagLoading, setFlagLoading] = useState(true);
  const canPunch = canPerformAction('write') && allowPwaPunch && !flagLoading;

  const {
    videoRef,
    stream,
    error: cameraError,
    facingMode,
    isTorchOn,
    startCamera,
    stopCamera,
    toggleCamera,
    toggleTorch,
    takeSelfie,
    takePhoto,
    loading: cameraLoading,
  } = useCamera();

  const { location, isLocating, error: locationError, detectLocation } = useGeoLocation();

  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isMobile, setIsMobile] = useState(false);
  const [fallbackPhoto, setFallbackPhoto] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [mediaReady, setMediaReady] = useState(false);
  const [gateChecking, setGateChecking] = useState(true);
  const [permBusy, setPermBusy] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraInitialized = useRef(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Live profile flag — auth/session user may be stale after manager toggle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFlagLoading(true);
      try {
        const allowed = await hrService.getMyAllowPwaPunch();
        if (!cancelled) setAllowPwaPunch(allowed);
      } catch {
        if (!cancelled) setAllowPwaPunch(!!user.allowPwaPunch);
      } finally {
        if (!cancelled) setFlagLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id, user.allowPwaPunch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGateChecking(true);
      try {
        if (!isSecureMediaContext()) {
          if (!cancelled) {
            setMediaReady(false);
            setPermError('errors.locationInsecureContext');
          }
          return;
        }
        const needGate = await shouldShowMediaPermissionGate();
        if (cancelled) return;
        if (!needGate) {
          setMediaReady(true);
        }
      } finally {
        if (!cancelled) setGateChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bootstrapHardware = useCallback(async () => {
    if (cameraInitialized.current) {
      await detectLocation(false);
      return;
    }
    cameraInitialized.current = true;
    const geoOk = await detectLocation(false);
    if (!geoOk) {
      // Permission revoked after we had marked ready — show the gate again.
      cameraInitialized.current = false;
      clearMediaReadyMark();
      setMediaReady(false);
      setPermError('errors.locationDeniedPwa');
      return;
    }
    await startCamera('user');
  }, [detectLocation, startCamera]);

  useEffect(() => {
    if (!mediaReady || cameraInitialized.current) return;
    void bootstrapHardware();
  }, [mediaReady, bootstrapHardware]);

  const handleEnableMedia = async () => {
    setPermBusy(true);
    setPermError(null);
    try {
      if (!isSecureMediaContext()) {
        setPermError('errors.locationInsecureContext');
        return;
      }

      // User gesture: request GPS (triggers system prompt when still "prompt").
      const geoOk = await detectLocation(false);
      if (!geoOk) {
        setPermError('errors.locationGeneric');
        return;
      }

      try {
        await startCamera('user');
      } catch {
        /* live stream optional — takePhoto() fallback still works */
      }

      writeMediaReadyMark({ geoOk: true, cameraOk: true });
      cameraInitialized.current = true;
      setMediaReady(true);
    } catch (err) {
      console.error('[PwaPunch] media enable failed', err);
      setPermError('errors.locationGeneric');
    } finally {
      setPermBusy(false);
    }
  };

  const handleTakePhoto = async () => {
    const photo = await takePhoto();
    if (photo) setFallbackPhoto(photo);
  };

  const handleBack = () => {
    stopCamera();
    onFinish?.();
  };

  const handleSubmit = async () => {
    if (!allowPwaPunch) {
      showToast(t('pwaPunchDisabledToast'), 'info');
      return;
    }
    if (!canPerformAction('write')) {
      if (subscription?.status === 'EXPIRED') showToast(t('trialExpiredToast'), 'warning');
      else if (subscription?.status === 'SUSPENDED') showToast(t('accountSuspendedToast'), 'error');
      return;
    }
    if (status !== 'idle' || !location) {
      if (!location) showToast(t('locationRequired'), 'warning');
      return;
    }

    let selfieData: string | null = null;
    if (stream && canvasRef.current) {
      selfieData = takeSelfie(canvasRef.current);
    } else if (fallbackPhoto) {
      selfieData = fallbackPhoto;
    } else {
      selfieData = await takePhoto();
      if (selfieData) setFallbackPhoto(selfieData);
    }
    if (!selfieData) {
      showToast(t('selfieRequired'), 'warning');
      return;
    }

    setStatus('loading');
    try {
      const punch = await hrService.createAppPunch({
        selfieDataUrl: selfieData,
        location: {
          lat: location.lat,
          lng: location.lng,
          address: location.address,
          accuracy: location.accuracy ?? undefined,
        },
      });
      const workDate = punchLocalDateKey(punch.punchedAt);
      try {
        await hrService.recalculateTimesheetDay(user.employeeId || punch.employeeId, workDate);
      } catch {
        /* day may not exist yet; queue/ingest will recalc */
      }
      setStatus('success');
      showToast(t('pwaPunchSuccess'), 'success');
      setTimeout(() => {
        stopCamera();
        onFinish?.();
      }, 900);
    } catch (e: unknown) {
      setStatus('idle');
      const code = String((e as { message?: string })?.message || '');
      const keyMap: Record<string, string> = {
        pwaPunchDisabled: 'pwaPunchDisabledToast',
        selfieRequired: 'selfieRequired',
        locationRequired: 'locationRequired',
        pwaPunchNoEmployeeId: 'pwaPunchNoEmployeeId',
        pwaPunchInactive: 'pwaPunchInactive',
      };
      showToast(t(keyMap[code] || 'pwaPunchFailed'), 'error');
    }
  };

  const hasPhoto = !!stream || !!fallbackPhoto;
  const timeLabel = formatTime(currentTime.toISOString(), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  if (gateChecking) {
    return (
      <div className="fixed inset-0 bg-[#fcfdfe] z-[9999] flex flex-col items-center justify-center gap-3">
        <Loader2 className="animate-spin text-slate-400" size={28} />
        <p className="text-sm text-slate-500">{t('pwaPunchPreparing')}</p>
      </div>
    );
  }

  if (!mediaReady) {
    return (
      <div className="fixed inset-0 bg-[#fcfdfe] z-[9999] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <button
            type="button"
            onClick={handleBack}
            className="h-10 w-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700"
            aria-label={t('back', { ns: 'common', defaultValue: 'Voltar' })}
          >
            <ArrowLeft size={18} />
          </button>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            {t('pwaPunchTitle')}
          </p>
          <div className="w-10" aria-hidden />
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5 text-center">
          <div className="flex gap-3">
            <span className="h-12 w-12 rounded-2xl bg-rose-50 text-[#c41e24] flex items-center justify-center">
              <MapPin size={22} />
            </span>
            <span className="h-12 w-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Camera size={22} />
            </span>
          </div>
          <div className="space-y-2 max-w-sm">
            <h1 className="text-lg font-bold text-slate-900">{t('pwaPunchPermTitle')}</h1>
            <p className="text-sm text-slate-600 leading-relaxed">{t('pwaPunchPermBody')}</p>
          </div>
          {(permError || locationError) && (
            <p className="text-xs text-rose-600 max-w-sm">
              {t((permError || locationError)!.startsWith('errors.') ? (permError || locationError)! : 'errors.locationGeneric')}
            </p>
          )}
          <button
            type="button"
            disabled={permBusy}
            onClick={() => void handleEnableMedia()}
            className="w-full max-w-[320px] h-14 rounded-2xl bg-[#c41e24] text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {permBusy ? <Loader2 className="animate-spin" size={20} /> : t('pwaPunchPermAllow')}
          </button>
          <p className="text-[11px] text-slate-400 max-w-xs">{t('pwaPunchPermHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#fcfdfe] z-[9999] flex flex-col animate-in slide-in-from-bottom-6 duration-500 overflow-hidden">
      <header className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <button
          type="button"
          onClick={handleBack}
          className="h-10 w-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700"
          aria-label={t('back', { ns: 'common', defaultValue: 'Voltar' })}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            {t('pwaPunchTitle')}
          </p>
          <p className="text-lg font-bold tabular-nums text-slate-900">{timeLabel}</p>
        </div>
        <div className="w-10" aria-hidden />
      </header>

      <p className="px-6 text-center text-xs text-slate-500 mb-2">{t('pwaPunchHint')}</p>

      <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        <CameraFeed
          videoRef={videoRef}
          stream={stream}
          error={cameraError}
          facingMode={facingMode}
          isMobile={isMobile}
          isTorchOn={isTorchOn}
          toggleTorch={toggleTorch}
          toggleCamera={toggleCamera}
          showSuccess={status === 'success'}
          fallbackPhoto={fallbackPhoto}
          onTakePhoto={handleTakePhoto}
          photoLoading={cameraLoading}
        >
          <LocationDisplay
            location={location}
            isLocating={isLocating}
            error={locationError}
            onRetry={() => detectLocation(true)}
          />
        </CameraFeed>
      </div>

      {!canPunch && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 flex items-center gap-2 text-amber-900">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">
            {flagLoading
              ? t('detectingLocation')
              : !allowPwaPunch
                ? t('pwaPunchDisabledBanner')
                : subscription?.status === 'EXPIRED'
                  ? t('trialExpiredBanner')
                  : t('accountSuspendedBanner')}
          </span>
        </div>
      )}

      <div className="px-8 pt-4 pb-12 flex flex-col items-center gap-3">
        <button
          type="button"
          disabled={
            !canPunch || !location || isLocating || status !== 'idle' || !hasPhoto
          }
          onClick={() => void handleSubmit()}
          className="w-full max-w-[320px] h-14 rounded-2xl bg-[#c41e24] text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {status === 'loading' ? (
            <Loader2 className="animate-spin" size={20} />
          ) : status === 'success' ? (
            t('verified')
          ) : (
            t('pwaPunchSubmit')
          )}
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default PwaPunch;
