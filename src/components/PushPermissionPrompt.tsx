import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, X, Smartphone } from 'lucide-react';
import {
  isPushSupported,
  getPushPermissionStatus,
  subscribeToPush,
} from '../services/pushNotification.service';
import {
  unlockNotificationAudio,
  playNotificationChime,
} from '../services/notificationAlert.service';

interface Props {
  userId?: string;
  organizationId?: string;
}

const SNOOZE_DAYS = 7;
const dismissKey = (userId: string) => `push_prompt_dismissed_${userId}`;

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

function isSnoozed(userId: string): boolean {
  const raw = localStorage.getItem(dismissKey(userId));
  if (!raw) return false;
  const ts = parseInt(raw, 10);
  if (Number.isNaN(ts)) return false;
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  return ageDays < SNOOZE_DAYS;
}

export const PushPermissionPrompt: React.FC<Props> = ({ userId, organizationId }) => {
  const { t } = useTranslation('common');
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'enable' | 'ios-install' | 'denied'>('enable');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId || !organizationId) return;
    if (isSnoozed(userId)) return;

    const iosNotInstalled = isIOS() && !isStandalone();
    if (iosNotInstalled) {
      setMode('ios-install');
      setVisible(true);
      return;
    }

    if (!isPushSupported() && !('Notification' in window)) return;
    const status = getPushPermissionStatus();
    if (status === 'denied') {
      setMode('denied');
      setVisible(true);
      return;
    }
    if (status !== 'default') return;

    setMode('enable');
    setVisible(true);
  }, [userId, organizationId]);

  if (!visible || !userId) return null;

  const dismiss = () => {
    localStorage.setItem(dismissKey(userId), Date.now().toString());
    setVisible(false);
  };

  const enable = async () => {
    if (!organizationId) return;
    setBusy(true);
    await unlockNotificationAudio();
    const ok = await subscribeToPush(userId, organizationId);
    if (ok || getPushPermissionStatus() === 'granted') {
      await playNotificationChime();
      setVisible(false);
    } else if (getPushPermissionStatus() === 'denied') {
      setMode('denied');
    } else {
      dismiss();
    }
    setBusy(false);
  };

  const titleKey =
    mode === 'ios-install' ? 'push.iosTitle' : mode === 'denied' ? 'push.deniedTitle' : 'push.title';
  const bodyKey =
    mode === 'ios-install' ? 'push.iosBody' : mode === 'denied' ? 'push.deniedBody' : 'push.body';

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[100] animate-in slide-in-from-bottom-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-4 flex items-start gap-4">
        <div className="p-2.5 bg-primary/10 rounded-xl flex-shrink-0">
          {mode === 'ios-install' ? (
            <Smartphone size={20} className="text-primary" />
          ) : (
            <Bell size={20} className="text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-800 tracking-tight">
            {t(titleKey)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
            {t(bodyKey)}
          </p>
          <div className="flex items-center gap-2 mt-2.5">
            {mode === 'enable' && (
              <button
                onClick={() => void enable()}
                disabled={busy}
                className="px-3 py-1.5 bg-primary text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {busy ? t('push.enabling') : t('push.enable')}
              </button>
            )}
            <button
              onClick={dismiss}
              className="px-3 py-1.5 text-slate-500 hover:text-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
            >
              {mode === 'denied' ? t('push.dismiss') : t('push.notNow')}
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
          title={t('push.dismiss')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
