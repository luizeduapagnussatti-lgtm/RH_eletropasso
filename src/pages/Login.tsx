
declare global {
  interface Window {
    PasswordCredential: typeof PasswordCredential;
  }
  interface PasswordCredentialData {
    id: string;
    password: string;
    name?: string;
    iconURL?: string;
  }
  class PasswordCredential extends Credential {
    constructor(data: PasswordCredentialData);
    readonly password: string;
  }
}

import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Mail, Lock, ArrowRight, AlertCircle, RefreshCw, Eye, EyeOff, Download, X, Share, MoreVertical, RotateCcw, Building2, Send, Home, CheckCircle2 } from 'lucide-react';
import { hrService } from '../services/hrService';
import { authService } from '../services/auth.service';
import { checkSupabaseConnection, isSupabaseConfigured } from '../services/supabase';
import { useToast } from '../context/ToastContext';
import { APP_NAME, APP_TAGLINE, STORE_LOGO_PATH } from '../config/branding';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
  onRegisterClick: () => void;
  onBackToLanding?: () => void;
  initError?: string;
}

const BrandLogo = () => {
  const { t } = useTranslation('auth');
  return (
    <div className="flex flex-col items-center justify-center gap-5">
      {/* Store wordmark only — RH circular icon is intentionally excluded from login */}
      <div className="w-full max-w-[280px] rounded-2xl bg-black px-6 py-5 border border-white/10">
        <img
          src={STORE_LOGO_PATH}
          className="w-full h-auto object-contain"
          alt="Eletropasso"
          width={320}
          height={96}
        />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
        {APP_NAME}
        </h1>
        <p className="text-slate-300 text-sm mt-1">{t('personnelGateway')}</p>
        <p className="text-slate-400 text-xs mt-1">{APP_TAGLINE}</p>
      </div>
    </div>
  );
};

const Login: React.FC<LoginProps> = ({ onLoginSuccess, onRegisterClick, onBackToLanding, initError }) => {
  const { t } = useTranslation('auth');
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(initError || '');
  const [isLoading, setIsLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [forgotError, setForgotError] = useState('');

  // Install Help State
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  
  const isConfigured = isSupabaseConfigured();
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>(
    isConfigured ? 'checking' : 'disconnected'
  );

  useEffect(() => {
    let isActive = true;

    const refreshConnectionStatus = async () => {
      const connected = await checkSupabaseConnection();
      if (isActive) setConnectionStatus(connected ? 'connected' : 'disconnected');
    };
    const handleOnline = () => {
      setConnectionStatus('checking');
      void refreshConnectionStatus();
    };
    const handleOffline = () => setConnectionStatus('disconnected');

    void refreshConnectionStatus();
    const intervalId = window.setInterval(refreshConnectionStatus, 30000);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // 1. Detect platform
    // iOS: only Safari-based browsers on Apple devices
    // Mobile: Android, HarmonyOS (Honor/Huawei), or any other mobile device
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const mobile = /Android|HarmonyOS|webOS|BlackBerry|Opera Mini|IEMobile|Mobile/i.test(ua) || ios;
    setIsIOS(ios);
    setIsMobile(mobile);

    // 2. Check if already installed as PWA (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    // 3. Check Native Prompt Status (Immediate)
    if ((window as any).deferredPWAPrompt) {
      setCanPrompt(true);
    }

    // 4. Listen for Native Prompt Event (Async)
    const handlePwaReady = () => setCanPrompt(true);
    window.addEventListener('pwa-install-available', handlePwaReady);

    return () => window.removeEventListener('pwa-install-available', handlePwaReady);
  }, []);

  const handleInstallClick = async () => {
    // 1. Try Native Prompt First (Android/Desktop Chrome)
    const promptEvent = (window as any).deferredPWAPrompt;

    if (promptEvent) {
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;

      if (outcome === 'accepted') {
        (window as any).deferredPWAPrompt = null;
        setCanPrompt(false);
      }
    } else {
      // 2. Fallback: Show instructions
      // On iOS: show Safari share instructions
      // On Android (non-Chrome browsers like Honor): show browser menu instructions
      setShowInstallHelp(true);
    }
  };

  // Full "nuclear" reset — destroys every client-side trace of the app so a
  // post-migration stale cache (Workbox precache, Supabase auth IndexedDB,
  // stale subscription ref, etc.) cannot survive into the next session.
  // Steps run in best-effort order; any individual failure must not block the
  // final reload.
  const handleSystemReset = async () => {
    if (!confirm(t('resetCacheConfirm'))) return;
    try {
      // 1. Wipe Workbox / runtime caches (the SW unregister below does NOT
      //    clear these — they live independently in CacheStorage).
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k).catch(() => false)));
      }
      // 2. Unregister every service worker.
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(() => false)));
      }
      // 3. Drop every IndexedDB database (Supabase auth lives here on some
      //    browsers; clearing it ensures a fully fresh session).
      if ('indexedDB' in window && (indexedDB as any).databases) {
        try {
          const dbs: { name?: string }[] = await (indexedDB as any).databases();
          await Promise.all(
            dbs.map(db =>
              db.name
                ? new Promise<void>((res) => {
                    const req = indexedDB.deleteDatabase(db.name!);
                    req.onsuccess = req.onerror = req.onblocked = () => res();
                  })
                : Promise.resolve()
            )
          );
        } catch { /* indexedDB.databases() not supported on Safari < 14 */ }
      }
      // 4. Wipe web storage.
      try { localStorage.clear(); } catch { /* private mode */ }
      try { sessionStorage.clear(); } catch { /* private mode */ }
    } finally {
      // 5. Hard reload with a cache-bust query so the HTML shell itself is
      //    re-requested from the network.
      window.location.replace(window.location.pathname + '?_=' + Date.now());
    }
  };

  // Non-destructive sibling of the Reset button: ask the active service
  // worker to check for a new build. If one is waiting, vite-plugin-pwa's
  // controllerchange handler will reload the page automatically; otherwise
  // the user gets a toast that they are already current.
  const handleCheckForUpdates = async () => {
    if (!('serviceWorker' in navigator)) {
      showToast(t('swUnsupported'), 'error');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        showToast(t('notInstalledPwa'), 'info');
        return;
      }
      await reg.update();
      if (reg.waiting) {
        showToast(t('updateFound'), 'success');
        // Ask the waiting SW to take over; controllerchange triggers reload.
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        showToast(t('latestVersion'), 'success');
      }
    } catch (err: any) {
      console.error('[Login] Update check failed:', err);
      showToast(t('updateCheckFailed'), 'error');
    }
  };

  const handleResendVerification = async () => {
    if (!email) return;
    try {
      await hrService.requestVerificationEmail(email);
      showToast(t('verificationSent'), "success");
      setShowResend(false);
      setError("");
    } catch (e) {
      showToast(t('verificationFailedSend'), "error");
    }
  };

  // Trigger iOS Safari / WKWebView "Save Password" via hidden form submission.
  //
  // Why this works:
  //   Safari only triggers the password save dialog on a real form navigation,
  //   not on XHR/fetch-only logins. We create a hidden form targeting a hidden
  //   iframe and submit it. The iframe absorbs the resulting 404.
  //
  // iOS PWA (standalone) specifics:
  //   WKWebView requires the form to be rendered (painted) for at least one
  //   animation frame before submission, otherwise credential detection is skipped.
  //   We also set the iframe src to about:blank first so WKWebView treats it as
  //   a valid navigation target (empty iframes can be ignored in standalone mode).
  //
  // IMPORTANT: This must be called BEFORE onLoginSuccess triggers a route change,
  //   otherwise the login form's DOM context is lost and Safari won't associate
  //   the credentials with this page. We wrap onLoginSuccess in the rAF callback
  //   so the form is submitted first, then login completes.
  const triggerSafariPasswordSave = (onComplete: () => void) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.name = 'safari-password-save';
      iframe.src = 'about:blank';
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(iframe);

      const form = document.createElement('form');
      form.method = 'POST';
      // Use the current page URL so Safari associates saved credentials with this origin.
      // The iframe absorbs the navigation; the 405/404 response doesn't matter.
      form.action = window.location.href;
      form.target = 'safari-password-save';
      form.autocomplete = 'on';

      const emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.name = 'username';
      emailInput.autocomplete = 'username';
      emailInput.value = email;
      form.appendChild(emailInput);

      const pwInput = document.createElement('input');
      pwInput.type = 'password';
      pwInput.name = 'password';
      pwInput.autocomplete = 'current-password';
      pwInput.value = password;
      form.appendChild(pwInput);

      document.body.appendChild(form);

      // Hand control back to React immediately — the dashboard transition is
      // now off the critical path. The form submission still runs (in the
      // same tick) so Safari sees the keystrokes-on-form and offers to save
      // credentials; we just don't gate the navigation on rAF anymore.
      // Previously double-rAF blocked onComplete for 30–100ms on slow iOS
      // devices.
      try { form.submit(); } catch { /* iframe may absorb error */ }
      onComplete();
      setTimeout(() => {
        try { form.remove(); } catch { /* already gone */ }
        try { iframe.remove(); } catch { /* already gone */ }
      }, 3000);
    } catch (_) {
      // If anything fails, still complete login
      onComplete();
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotStatus('loading');
    const result = await authService.requestPasswordReset(forgotEmail);
    if (result.ok) {
      setForgotStatus('sent');
    } else {
      setForgotError(result.error || t('resetEmailFailed'));
      setForgotStatus('error');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfigured) {
      setError(t('backendNotConfigured'));
      return;
    }
    setIsLoading(true);
    setError('');
    setShowResend(false);

    try {
      const result = await hrService.login(email, password);
      if (result.user) {
        // Detect iOS: all iOS browsers use WebKit, so PasswordCredential is never
        // truly supported even if the global exists (e.g. Chrome on iOS is WKWebView).
        const ua = navigator.userAgent;
        const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;

        // "Save Password" — two strategies by platform:
        //   1. Chrome/Edge/Android browser & PWA: Credential Management API
        //   2. iOS Safari & iOS PWA (standalone): hidden form submission trick
        //
        // For iOS: the hidden form MUST be submitted while the login page DOM is
        // still mounted. If we call onLoginSuccess first, React unmounts the page
        // and Safari loses the credential context. So on iOS we submit the form
        // first (via rAF) and call onLoginSuccess in the completion callback.
        // For non-iOS: we complete login first, then save credentials async.

        if (isIOSDevice) {
          triggerSafariPasswordSave(() => {
            onLoginSuccess(result.user!);
          });
        } else {
          onLoginSuccess(result.user);

          setTimeout(() => {
            try {
              if (window.PasswordCredential) {
                const cred = new window.PasswordCredential({
                  id: email,
                  password: password,
                  name: result.user!.name || email,
                });
                navigator.credentials.store(cred).catch(() => {});
              }
            } catch (_) { /* Silently ignore */ }
          }, 300);
        }
      } else {
        const msg = result.error || t('loginFailed');
        setError(msg);
        if (msg.toLowerCase().includes('verified') || msg.toLowerCase().includes('verification')) {
          setShowResend(true);
        }
      }
    } catch (err: any) {
      setError(t('systemError', { message: err.message }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col text-white items-center justify-center px-4 py-8 sm:px-6 relative overflow-x-hidden"
      style={{ backgroundColor: '#0a0e17', backgroundImage: 'none' }}
    >
      <div className="w-full max-w-[470px]">
        <div
          className="border border-[#383838] rounded-2xl overflow-hidden"
          style={{
            backgroundColor: '#181818',
            backgroundImage: 'none',
            boxShadow: 'none',
            filter: 'none',
            opacity: 1,
            isolation: 'isolate',
          }}
        >
          <div className="p-7 sm:p-9 md:p-10 space-y-8">
            {/* Brand Header */}
            <BrandLogo />

            {/* Forgot Password Flow */}
            {showForgot ? (
              <div className="space-y-6">
                {forgotStatus === 'sent' ? (
                  <div className="flex flex-col items-center gap-5 text-center py-2">
                    <div className="p-4 bg-emerald-500/10 border border-emerald-400/20 rounded-full">
                      <CheckCircle2 size={36} className="text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-white">{t('checkEmail')}</p>
                      <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                        <Trans
                          i18nKey="auth:resetLinkSentTo"
                          values={{ email: forgotEmail }}
                          components={{ email: <span className="font-semibold text-white" /> }}
                        />
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowForgot(false); setForgotStatus('idle'); setForgotEmail(''); setForgotError(''); }}
                      className="w-full min-h-12 py-3.5 bg-[var(--brand-red)] text-white rounded-xl font-semibold text-sm hover:bg-[var(--brand-red-mirror)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#181818] transition-all flex items-center justify-center gap-2"
                    >
                      {t('backToLogin')} <ArrowRight size={16} />
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-5">
                    <div className="text-center space-y-2">
                      <p className="text-lg font-semibold text-white">{t('resetPassword')}</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{t('resetPasswordHint')}</p>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="forgot-email" className="text-xs font-semibold text-slate-200 px-1">{t('organizationEmail')}</label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[var(--brand-red-mirror)] transition-colors z-10" size={18} />
                        <input
                          id="forgot-email"
                          type="email"
                          required
                          autoComplete="email"
                          className="w-full min-h-12 pl-12 pr-4 py-3.5 bg-[#202020] border border-[#414141] rounded-xl text-sm font-medium text-white outline-none transition-colors focus:border-white placeholder:text-slate-400"
                          placeholder={t('emailPlaceholder')}
                          value={forgotEmail}
                          onChange={e => setForgotEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    {forgotStatus === 'error' && (
                      <div className="p-3.5 bg-rose-950/40 text-rose-200 rounded-xl border border-rose-500/30 flex items-center gap-3 text-sm font-medium">
                        <AlertCircle size={14} className="flex-shrink-0" />
                        <span>{forgotError}</span>
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={forgotStatus === 'loading'}
                      className="w-full min-h-12 py-3.5 bg-[var(--brand-red)] text-white rounded-xl font-semibold text-sm hover:bg-[var(--brand-red-mirror)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#181818] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {forgotStatus === 'loading' ? <RefreshCw className="animate-spin" size={18} /> : <>{t('sendResetLink')} <ArrowRight size={16} /></>}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowForgot(false); setForgotStatus('idle'); setForgotError(''); }}
                      className="w-full min-h-11 py-2.5 text-slate-300 text-sm font-medium hover:text-white transition-colors"
                    >
                      {t('backToLogin')}
                    </button>
                  </form>
                )}
              </div>
            ) : (
            <form onSubmit={handleLogin} className="space-y-6" autoComplete="on" method="post" action=".">
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="login-email" className="text-xs font-semibold text-slate-200 px-1">{t('organizationEmail')}</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[var(--brand-red-mirror)] transition-colors z-10" size={18} />
                    <input
                      id="login-email"
                      type="email"
                      name="email"
                      autoComplete="username"
                      required
                      className="w-full min-h-12 pl-12 pr-4 py-3.5 bg-[#202020] border border-[#414141] rounded-xl text-sm font-medium text-white outline-none transition-colors focus:border-white placeholder:text-slate-400"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder={t('emailPlaceholder')}
                    />
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <label htmlFor="login-password" className="text-xs font-semibold text-slate-200 px-1">{t('securityCredentials')}</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[var(--brand-red-mirror)] transition-colors z-10" size={18} />
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete="current-password"
                      required
                      className="w-full min-h-12 pl-12 pr-12 py-3.5 bg-[#202020] border border-[#414141] rounded-xl text-sm font-medium text-white outline-none transition-colors focus:border-white placeholder:text-slate-400"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={t('passwordPlaceholder')}
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 min-w-11 min-h-11 inline-flex items-center justify-center text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-lg transition-colors z-10"
                      aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3.5 bg-rose-950/40 text-rose-200 rounded-xl border border-rose-500/30 animate-in shake space-y-2" role="alert">
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-3 text-sm font-medium">
                    <div className="flex items-center gap-3">
                      <AlertCircle size={14} className="flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                    {showResend && (
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        className="ml-auto flex items-center gap-1.5 bg-rose-500/15 px-3 py-2 rounded-lg text-rose-100 hover:bg-rose-500/25 transition-colors"
                      >
                        <Send size={10} /> {t('resendVerification')}
                      </button>
                    )}
                  </div>
                  {showResend && (
                    <p className="text-xs font-medium text-rose-200/85 leading-relaxed">
                      {t('spamHint')}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full min-h-12 py-3.5 bg-[var(--brand-red)] text-white rounded-xl font-semibold text-sm hover:bg-[var(--brand-red-mirror)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#181818] transition-all flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
                >
                  {isLoading ? <RefreshCw className="animate-spin" size={18} /> : <>{t('continue')} <ArrowRight size={16} /></>}
                </button>

                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotStatus('idle'); setForgotError(''); }}
                  className="w-full min-h-11 py-2 text-slate-300 text-sm font-medium hover:text-white transition-colors"
                >
                  {t('forgotPassword')}
                </button>

                <button
                  type="button"
                  onClick={onRegisterClick}
                  className="w-full min-h-12 py-3 bg-transparent text-slate-200 border border-[#3a495e] rounded-xl font-semibold text-sm hover:bg-white/5 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-all flex items-center justify-center gap-2"
                >
                  <Building2 size={14} /> {t('registerOrg')}
                </button>

                {/* Back to Home */}
                {onBackToLanding && (
                  <button
                    type="button"
                    onClick={onBackToLanding}
                    className="w-full min-h-11 py-2.5 text-slate-300 text-sm font-medium hover:text-white transition-colors flex items-center justify-center gap-2"
                  >
                    <Home size={12} /> {t('backToHome')}
                  </button>
                )}

                {/* Utils Row: Install & Reset */}
                <div className={`grid ${isInstalled ? 'grid-cols-2' : 'grid-cols-3'} gap-1 pt-4 border-t border-[#383838]`}>
                   {!isInstalled && (
                   <button
                     type="button"
                     onClick={handleInstallClick}
                     className="min-h-11 flex items-center justify-center gap-1.5 px-2 py-2 text-slate-400 rounded-lg text-xs font-medium hover:text-white hover:bg-white/5 transition-colors"
                   >
                     <Download size={12} /> {isIOS && !canPrompt ? t('appGuide') : t('installApp')}
                   </button>
                   )}

                   <button
                     type="button"
                     onClick={handleCheckForUpdates}
                     className="min-h-11 flex items-center justify-center gap-1.5 px-2 py-2 text-slate-400 rounded-lg text-xs font-medium hover:text-white hover:bg-white/5 transition-colors"
                     title={t('updates')}
                   >
                     <RefreshCw size={12} /> {t('updates')}
                   </button>

                   <button
                     type="button"
                     onClick={handleSystemReset}
                     className="min-h-11 flex items-center justify-center gap-1.5 px-2 py-2 text-slate-400 rounded-lg text-xs font-medium hover:text-rose-300 transition-colors"
                     title={t('resetCache')}
                   >
                     <RotateCcw size={12} /> {t('resetCache')}
                   </button>
                </div>
              </div>
            </form>
            )} {/* end showForgot */}
          </div>
        </div>

        {/* System Version */}
        <p className="text-center mt-5 text-xs font-medium text-slate-500">v3.0 · {t('multiTenant')}</p>
      </div>

      {/* Database Connection Indicator */}
      <div
        className="fixed top-5 right-5 hidden md:flex items-center gap-2 bg-[var(--chrome-bg)] px-3 py-2 rounded-full border border-[var(--chrome-border)]"
        role="status"
        aria-live="polite"
        title={t(`databaseConnection.${connectionStatus}Hint`)}
      >
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            connectionStatus === 'connected'
              ? 'bg-emerald-500'
              : connectionStatus === 'checking'
                ? 'bg-amber-400 animate-pulse'
                : 'bg-rose-500'
          }`}
        />
        <span className="text-xs font-medium text-slate-300">
          {t(`databaseConnection.${connectionStatus}`)}
        </span>
      </div>

      {/* Installation Instructions Popup */}
      {showInstallHelp && (
        <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-[var(--chrome-bg)] w-full max-w-sm rounded-2xl p-6 shadow-xl animate-in slide-in-from-bottom-10 border border-[var(--chrome-border)]">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-base font-semibold text-white flex items-center gap-2">
                   <Download size={18} className="text-[var(--brand-red-mirror)]"/> {t('installGuide')}
                 </h3>
                 <button onClick={() => setShowInstallHelp(false)} className="min-w-11 min-h-11 inline-flex items-center justify-center bg-white/5 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white transition-colors" aria-label={t('closeInstructions')}><X size={18}/></button>
              </div>
              
              {isIOS ? (
                <div className="space-y-5">
                   <p className="text-sm font-medium text-slate-300 leading-relaxed">{t('installIosIntro')}</p>
                   <div className="space-y-3">
                      <div className="flex items-center gap-4 p-3 bg-[#111a26] border border-[#344258] rounded-xl">
                         <div className="w-9 h-9 rounded-lg bg-[#243044] flex items-center justify-center text-blue-400"><Share size={18} /></div>
                         <div className="text-sm font-medium text-slate-200">{t('installIos1')}</div>
                      </div>
                      <div className="flex items-center gap-4 p-3 bg-[#111a26] border border-[#344258] rounded-xl">
                         <div className="w-9 h-9 rounded-lg bg-[#243044] flex items-center justify-center text-white font-semibold">+</div>
                         <div className="text-sm font-medium text-slate-200">{t('installIos2')}</div>
                      </div>
                      <div className="flex items-center gap-4 p-3 bg-[#111a26] border border-[#344258] rounded-xl">
                         <div className="min-w-9 h-9 px-2 rounded-lg bg-[#243044] flex items-center justify-center text-white font-semibold text-xs">{t('installIos3Add')}</div>
                         <div className="text-sm font-medium text-slate-200">{t('installIos3')}</div>
                      </div>
                   </div>
                </div>
              ) : isMobile ? (
                <div className="space-y-5">
                   <p className="text-sm font-medium text-slate-300 leading-relaxed">{t('installAndroidIntro')}</p>
                   <div className="space-y-3">
                      <div className="flex items-center gap-4 p-3 bg-[#111a26] border border-[#344258] rounded-xl">
                         <div className="w-9 h-9 rounded-lg bg-[#243044] flex items-center justify-center text-slate-200"><MoreVertical size={18} /></div>
                         <div className="text-sm font-medium text-slate-200">{t('installAndroid1')}</div>
                      </div>
                      <div className="flex items-center gap-4 p-3 bg-[#111a26] border border-[#344258] rounded-xl">
                         <div className="w-9 h-9 rounded-lg bg-[#243044] flex items-center justify-center text-[var(--brand-red-mirror)]"><Download size={18} /></div>
                         <div className="text-sm font-medium text-slate-200">{t('installAndroid2')}</div>
                      </div>
                      <div className="flex items-center gap-4 p-3 bg-[#111a26] border border-[#344258] rounded-xl">
                         <div className="w-9 h-9 rounded-lg bg-[#243044] flex items-center justify-center text-emerald-400 font-semibold">✓</div>
                         <div className="text-sm font-medium text-slate-200">{t('installAndroid3')}</div>
                      </div>
                   </div>

                </div>
              ) : (
                <div className="space-y-5">
                   <p className="text-sm font-medium text-slate-300 leading-relaxed">{t('installDesktopIntro')}</p>
                   <div className="space-y-3">
                      <div className="flex items-center gap-4 p-3 bg-[#111a26] border border-[#344258] rounded-xl">
                         <div className="w-9 h-9 rounded-lg bg-[#243044] flex items-center justify-center text-slate-200"><MoreVertical size={18} /></div>
                         <div className="text-sm font-medium text-slate-200">{t('installDesktop1')}</div>
                      </div>
                      <div className="flex items-center gap-4 p-3 bg-[#111a26] border border-[#344258] rounded-xl">
                         <div className="w-9 h-9 rounded-lg bg-[#243044] flex items-center justify-center text-[var(--brand-red-mirror)]"><Download size={18} /></div>
                         <div className="text-sm font-medium text-slate-200">{t('installDesktop2')}</div>
                      </div>
                   </div>
                </div>
              )}
              
              <button onClick={() => setShowInstallHelp(false)} className="w-full min-h-12 mt-6 py-3.5 bg-[var(--brand-red)] hover:bg-[var(--brand-red-mirror)] text-white rounded-xl font-semibold text-sm transition-colors">{t('closeInstructions')}</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default Login;
