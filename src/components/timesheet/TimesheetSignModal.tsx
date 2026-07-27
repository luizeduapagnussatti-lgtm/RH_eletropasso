import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Camera, Loader2, PenLine } from 'lucide-react';
import { ErrorBoundary } from '../ErrorBoundary';
import { CameraFeed } from '../attendance/CameraFeed';
import { SignatureCanvas } from './SignatureCanvas';
import { useCamera } from '../../hooks/attendance/useCamera';
import { TimesheetDay } from '../../types';

type Step = 'review' | 'selfie' | 'rubric';

interface Props {
  open: boolean;
  periodLabel: string;
  days: TimesheetDay[];
  fmtMinutes: (mins: number) => string;
  onClose: () => void;
  onSubmit: (payload: { selfieDataUrl: string; signatureDataUrl: string }) => Promise<void>;
}

const TimesheetSignModal: React.FC<Props> = ({
  open,
  periodLabel,
  days,
  fmtMinutes,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation('mobile');
  const [step, setStep] = useState<Step>('review');
  const [selfie, setSelfie] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

  useEffect(() => {
    if (!open) {
      setStep('review');
      setSelfie(null);
      setSignature(null);
      stopCamera();
      return;
    }
  }, [open, stopCamera]);

  useEffect(() => {
    if (open && step === 'selfie') {
      void startCamera('user');
    } else {
      stopCamera();
    }
  }, [open, step, startCamera, stopCamera]);

  const handleTakePhoto = async () => {
    if (stream && canvasRef.current) {
      const data = takeSelfie(canvasRef.current);
      if (data) {
        setSelfie(data);
        return;
      }
    }
    const photo = await takePhoto();
    if (photo) setSelfie(photo);
  };

  if (!open) return null;

  const totals = {
    worked: days.reduce((s, d) => s + d.workedMinutes, 0),
    overtime: days.reduce((s, d) => s + d.overtimeMinutes, 0),
    absence: days.reduce((s, d) => s + d.absenceMinutes, 0),
  };

  const handleConfirm = async () => {
    if (!selfie || !signature) return;
    setSubmitting(true);
    try {
      await onSubmit({ selfieDataUrl: selfie, signatureDataUrl: signature });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <button type="button" onClick={onClose} className="p-2 -ml-2 text-slate-400" aria-label="Close">
            <ArrowLeft size={20} />
          </button>
          <div className="flex gap-2 text-[10px] font-bold uppercase tracking-widest">
            <span className={step === 'review' ? 'text-primary' : 'text-slate-300'}>{t('signStepReview')}</span>
            <span className={step === 'selfie' ? 'text-primary' : 'text-slate-300'}>{t('signStepSelfie')}</span>
            <span className={step === 'rubric' ? 'text-primary' : 'text-slate-300'}>{t('signStepRubric')}</span>
          </div>
          <div className="w-8" />
        </div>

        <div className="p-5 space-y-4">
          {step === 'review' && (
            <>
              <p className="text-sm text-slate-600">
                {t('signConfirmLabel', { period: periodLabel })}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 p-3 text-center">
                  <p className="text-[9px] uppercase text-slate-400 font-bold">{t('workedHours')}</p>
                  <p className="text-sm font-semibold tabular-nums">{fmtMinutes(totals.worked)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-center">
                  <p className="text-[9px] uppercase text-slate-400 font-bold">{t('overtimeHours')}</p>
                  <p className="text-sm font-semibold tabular-nums">{fmtMinutes(totals.overtime)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-center">
                  <p className="text-[9px] uppercase text-slate-400 font-bold">{t('absenceHours')}</p>
                  <p className="text-sm font-semibold tabular-nums">{fmtMinutes(totals.absence)}</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">{days.length} dias no espelho</p>
              <button
                type="button"
                onClick={() => setStep('selfie')}
                className="w-full py-4 bg-primary text-white rounded-2xl font-semibold flex items-center justify-center gap-2"
              >
                {t('signStepSelfie')} <ArrowRight size={16} />
              </button>
            </>
          )}

          {step === 'selfie' && (
            <>
              <canvas ref={canvasRef} className="hidden" aria-hidden />
              <ErrorBoundary>
                <CameraFeed
                  videoRef={videoRef}
                  stream={stream}
                  error={cameraError}
                  facingMode={facingMode}
                  isMobile={isMobile}
                  isTorchOn={isTorchOn}
                  toggleTorch={toggleTorch}
                  toggleCamera={toggleCamera}
                  showSuccess={!!selfie}
                  fallbackPhoto={selfie}
                  onTakePhoto={() => { void handleTakePhoto(); }}
                  photoLoading={cameraLoading}
                />
              </ErrorBoundary>
              {!selfie ? (
                <button
                  type="button"
                  onClick={() => { void handleTakePhoto(); }}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-semibold flex items-center justify-center gap-2"
                >
                  <Camera size={18} /> {t('signStepSelfie')}
                </button>
              ) : (
                <div className="space-y-3">
                  <img src={selfie} alt="" className="w-32 h-32 rounded-2xl object-cover mx-auto ring-2 ring-primary/30" />
                  <button
                    type="button"
                    onClick={() => setStep('rubric')}
                    className="w-full py-4 bg-primary text-white rounded-2xl font-semibold flex items-center justify-center gap-2"
                  >
                    {t('signStepRubric')} <PenLine size={16} />
                  </button>
                </div>
              )}
            </>
          )}

          {step === 'rubric' && (
            <>
              <SignatureCanvas onChange={setSignature} />
              <button
                type="button"
                disabled={!selfie || !signature || submitting}
                onClick={() => void handleConfirm()}
                className="w-full py-4 bg-primary text-white rounded-2xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
                {t('signSubmit')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimesheetSignModal;
