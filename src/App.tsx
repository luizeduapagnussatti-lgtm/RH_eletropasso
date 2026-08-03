
import React, { useState, useEffect, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Analytics } from '@vercel/analytics/react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SearchProvider } from './context/SearchContext';
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext';
import { ToastProvider } from './context/ToastContext';
import MainLayout from './layouts/MainLayout';
import CookieConsent from './components/CookieConsent';
import SearchDialog from './components/search/SearchDialog';
import { PWAUpdateBanner } from './components/PWAUpdateBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { lazyWithReload } from './utils/lazyWithReload';
import { supabase } from './services/supabase';

// Eager: minimal public pages (Eletropasso intranet — no marketing blog/features/about)
import Login from './pages/Login';
import Setup from './pages/Setup';
import { VerifyAccount } from './pages/VerifyAccount';
import { ResetPassword } from './pages/ResetPassword';
import TutorialsPage from './pages/TutorialsPage';
import TutorialPage from './pages/TutorialPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import NotFoundPage from './pages/NotFoundPage';
import ChangelogPage from './pages/ChangelogPage';

// Lazy: authenticated pages loaded on demand after login.
// lazyWithReload auto-recovers from stale chunk hashes after a deploy
// (one-shot reload + SW/cache wipe) so users don't get stuck on a blank
// page when their cached service worker still references deleted assets.
const Dashboard = lazyWithReload(() => import('./pages/Dashboard'));
const EmployeeDirectory = lazyWithReload(() => import('./pages/EmployeeDirectory'));
const EmployeeOnboarding = lazyWithReload(() => import('./pages/EmployeeOnboarding'));
const EmployeeLifecyclePage = lazyWithReload(() => import('./pages/EmployeeLifecyclePage'));
const Attendance = lazyWithReload(() => import('./pages/Attendance'));
const AttendanceLogs = lazyWithReload(() => import('./pages/AttendanceLogs'));
const Leave = lazyWithReload(() => import('./pages/Leave'));
const Settings = lazyWithReload(() => import('./pages/Settings'));
const Reports = lazyWithReload(() => import('./pages/Reports'));
const Organization = lazyWithReload(() => import('./pages/Organization'));
const SuperAdmin = lazyWithReload(() => import('./pages/SuperAdmin'));
const PerformanceReview = lazyWithReload(() => import('./pages/PerformanceReview'));
const Announcements = lazyWithReload(() => import('./pages/Announcements'));
const AdminNotifications = lazyWithReload(() => import('./pages/AdminNotifications'));
const Timesheet = lazyWithReload(() => import('./pages/Timesheet'));
const Payroll = lazyWithReload(() => import('./pages/Payroll'));
const PontoHub = lazyWithReload(() => import('./pages/PontoHub'));
const Apuracao = lazyWithReload(() => import('./pages/Apuracao'));
const Comunicacao = lazyWithReload(() => import('./pages/Comunicacao'));
const WorkRoster = lazyWithReload(() => import('./pages/WorkRoster'));
const MessagingOutbox = lazyWithReload(() => import('./pages/MessagingOutbox'));
const MyTimesheet = lazyWithReload(() => import('./pages/MyTimesheet'));
const MyRoster = lazyWithReload(() => import('./pages/MyRoster'));

import { navigateTo } from './utils/seo';
import { PushPermissionPrompt } from './components/PushPermissionPrompt';
import { useToast } from './context/ToastContext';
import { useEmployeeMobileShell } from './hooks/useEmployeeMobileShell';
import { isAttendanceRoute, shouldUseEmployeeMobileShell } from './utils/mobileShell';
import { canAccessMyRoster, isPjContractor, needsClockAdmission } from './utils/roles';

// Legacy SaaS marketing paths — redirect to login on load
const DEPRECATED_PUBLIC_PREFIXES = ['/blog', '/features', '/about'];

function redirectDeprecatedPublicPath(): boolean {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (DEPRECATED_PUBLIC_PREFIXES.some(p => path === p || path.startsWith(`${p}/`))) {
    window.history.replaceState(null, '', '/');
    return true;
  }
  return false;
}

// Parse changelog route from pathname
const parseChangelogRoute = (pathname: string) => {
  if (pathname === '/changelog' || pathname === '/changelog/') {
    return true;
  }
  return false;
};

// Parse tutorial route (authenticated help only — public /how-to-use redirects at login gate)
const parseTutorialRoute = (pathname: string) => {
  if (pathname === '/how-to-use' || pathname === '/how-to-use/') {
    return { type: 'list' as const };
  }
  const match = pathname.match(/^\/how-to-use\/(.+)$/);
  if (match && match[1]) {
    return { type: 'single' as const, slug: match[1] };
  }
  return null;
};

const AppContent: React.FC = () => {
  const { user, isLoading, isConfigured, setConfigured, login, logout } = useAuth();
  useSubscription();
  const { showToast } = useToast();
  const { t: tMobile } = useTranslation('mobile');
  const employeeMobileShell = useEmployeeMobileShell();
  const [currentPath, setCurrentPath] = useState('dashboard');
  const [navParams, setNavParams] = useState<any>(null);

  // Public Pages State — login is the default entry
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [policyRoute, setPolicyRoute] = useState<'privacy' | 'terms' | null>(() => {
    const path = window.location.pathname;
    if (path === '/privacy' || path === '/privacy/') return 'privacy';
    if (path === '/terms' || path === '/terms/') return 'terms';
    return null;
  });
  const [changelogRoute, setChangelogRoute] = useState<boolean>(() => {
    if (redirectDeprecatedPublicPath()) return false;
    return parseChangelogRoute(window.location.pathname);
  });
  const [is404, setIs404] = useState<boolean>(() => {
    if (redirectDeprecatedPublicPath()) return false;
    const path = window.location.pathname;
    const hash = window.location.hash;
    const search = window.location.search;
    const knownPaths = ['/', '/privacy', '/privacy/', '/terms', '/terms/', '/changelog', '/changelog/', '/_/', '/_'];

    if (new URLSearchParams(search).has('token')) return false;
    if (hash.includes('token=')) return false;
    if (hash.includes('/auth/confirm-verification/')) return false;

    if (parseTutorialRoute(path)) return false;
    if (parseChangelogRoute(path)) return false;

    if (hash && hash !== '#' && hash !== '#/') return false;

    if (path === '/_/' || path === '/_') {
      window.history.replaceState(null, '', '/' + search + hash);
      return false;
    }

    return !knownPaths.includes(path);
  });

  // Check URL for verification token on mount
  useEffect(() => {
    // Skip if on a recognized route
    if (policyRoute || changelogRoute) return;

    let token: string | null = null;

    // 1. Check Search Params (Standard: /?token=...)
    token = new URLSearchParams(window.location.search).get('token');

    // 2. Check Hash Params (Fallback: /#/?token=...)
    if (!token && window.location.hash.includes('?')) {
      const hashQuery = window.location.hash.split('?')[1];
      token = new URLSearchParams(hashQuery).get('token');
    }

    // 3. Check PocketBase default format: /_/#/auth/confirm-verification/{TOKEN}
    if (!token && window.location.hash.includes('/auth/confirm-verification/')) {
      const match = window.location.hash.match(/\/auth\/confirm-verification\/([^/?#]+)/);
      if (match && match[1]) {
        token = match[1];
      }
    }

    if (token) {
      setVerificationToken(token);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      return;
    }

    // Check for password reset redirect: /?reset=1 (query) or #type=recovery (hash, Supabase default)
    const queryReset = new URLSearchParams(window.location.search).get('reset') === '1';
    const hashRecovery = window.location.hash.includes('type=recovery');
    if (queryReset || hashRecovery) {
      setShowPasswordReset(true);
      // Strip query but KEEP hash — supabase-js needs hash tokens to establish recovery session
      if (queryReset) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Listen for Supabase PASSWORD_RECOVERY event (fires after hash tokens parsed)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordReset(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Legacy hash redirect: redirect old #/blog and #/how-to-use URLs to clean paths
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;

      // Redirect legacy hash blog routes to clean URLs
      if (hash === '#/blog' || hash === '#/blog/') {
        navigateTo('/blog');
        return;
      }
      const blogMatch = hash.match(/^#\/blog\/(.+)$/);
      if (blogMatch && blogMatch[1]) {
        navigateTo(`/blog/${blogMatch[1]}`);
        return;
      }

      // Redirect legacy hash tutorial routes to authenticated help (after login)
      if (hash === '#/how-to-use' || hash === '#/how-to-use/') {
        return;
      }
      const tutorialMatch = hash.match(/^#\/how-to-use\/(.+)$/);
      if (tutorialMatch && tutorialMatch[1]) {
        return;
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Listen for popstate (browser back/forward) for clean URL routes
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      const search = window.location.search;
      const knownPaths = ['/', '/privacy', '/privacy/', '/terms', '/terms/', '/changelog', '/changelog/', '/_/', '/_'];

      const hasToken = new URLSearchParams(search).has('token') || hash.includes('token=') || hash.includes('/auth/confirm-verification/');
      const hasHashRoute = hash && hash !== '#' && hash !== '#/';

      const clearAll = () => { setPolicyRoute(null); setChangelogRoute(false); };

      if (redirectDeprecatedPublicPath()) {
        clearAll();
        setIs404(false);
        return;
      }

      // Never show 404 for verification tokens or hash-based routes

      // Clean up /_/ path (PocketBase admin path leaked into verification URLs)
      if (path === '/_/' || path === '/_') {
        window.history.replaceState(null, '', '/' + search + hash);
        clearAll();
        setIs404(false);
        return;
      }

      // Check changelog route
      if (parseChangelogRoute(path)) {
        clearAll();
        setChangelogRoute(true);
        setIs404(false);
        return;
      }

      if (path === '/privacy' || path === '/privacy/') {
        clearAll();
        setPolicyRoute('privacy');
        setIs404(false);
      } else if (path === '/terms' || path === '/terms/') {
        clearAll();
        setPolicyRoute('terms');
        setIs404(false);
      } else if (path === '/' || knownPaths.includes(path) || hasToken || hasHashRoute) {
        clearAll();
        setIs404(false);
      } else {
        clearAll();
        setIs404(true);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Push subscription handled via PushPermissionPrompt (soft-gate, user-initiated)

  const handleNavigate = (path: string, params?: any) => {
    const mobilePunchBlock =
      user &&
      shouldUseEmployeeMobileShell(user) &&
      (path === 'attendance' ||
        path === 'attendance-quick-office' ||
        path === 'attendance-quick-factory' ||
        path === 'attendance-finish' ||
        isAttendanceRoute(path));

    if (mobilePunchBlock) {
      showToast(tMobile('punchBlockedMessage'), 'info');
      setCurrentPath('dashboard');
      setNavParams(null);
      return;
    }

    if (path === 'attendance-quick-office') {
      setCurrentPath('attendance');
      setNavParams({ autoStart: 'OFFICE' });
    } else if (path === 'attendance-quick-factory') {
      setCurrentPath('attendance');
      setNavParams({ autoStart: 'FACTORY' });
    } else if (path === 'attendance-finish') {
      setCurrentPath('attendance');
      setNavParams({ autoStart: 'FINISH' });
    } else if (path === 'timesheet' && employeeMobileShell) {
      setCurrentPath('my-timesheet');
      setNavParams(params || null);
    } else if (path === 'my-timesheet' || path === 'my-roster') {
      setCurrentPath(path);
      setNavParams(params || null);
    } else {
      setCurrentPath(path);
      setNavParams(params || null);
    }
  };

  useEffect(() => {
    const onInternalNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string; params?: Record<string, unknown> }>).detail;
      if (detail?.path) handleNavigate(detail.path, detail.params);
    };
    window.addEventListener('openhr-navigate', onInternalNavigate);
    return () => window.removeEventListener('openhr-navigate', onInternalNavigate);
  }, [user]);

  if (!isConfigured) {
    return <Setup onComplete={() => setConfigured(true)} />;
  }

  // Priority 0a: Public Policy Pages (accessible regardless of auth, clean URLs)
  if (policyRoute === 'privacy') {
    return <PrivacyPolicyPage onBack={() => { navigateTo('/'); }} />;
  }
  if (policyRoute === 'terms') {
    return <TermsOfServicePage onBack={() => { navigateTo('/'); }} />;
  }

  if (changelogRoute) {
    return <ChangelogPage onBack={() => { navigateTo('/'); }} />;
  }

  // Priority 1: Verification Flow (must come BEFORE 404 check)
  if (verificationToken) {
    return <VerifyAccount token={verificationToken} onFinished={() => { setVerificationToken(null); }} />;
  }

  // Priority 1.5: Password Reset Flow
  if (showPasswordReset) {
    return <ResetPassword onFinished={() => { setShowPasswordReset(false); }} />;
  }

  // 404: Unknown clean URL path (after all valid routes are checked)
  if (is404) {
    return <NotFoundPage onGoHome={() => { navigateTo('/'); }} />;
  }

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  // Public Login only (single-tenant — no org registration)
  if (!user) {
    const tutorialPublic = parseTutorialRoute(window.location.pathname);
    if (tutorialPublic) {
      window.history.replaceState(null, '', '/');
    }
    return <Login onLoginSuccess={login} />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  // Priority 3: Authenticated App
  const renderContent = () => {
    // Super Admin has a dedicated dashboard
    if (isSuperAdmin && (currentPath === 'dashboard' || currentPath === 'super-admin')) {
      return <SuperAdmin user={user} onNavigate={handleNavigate} />;
    }

    switch (currentPath) {
      case 'dashboard': return <Dashboard user={user} onNavigate={handleNavigate} />;
      case 'super-admin': return <SuperAdmin user={user} onNavigate={handleNavigate} />;
      case 'help':
        return (
          <TutorialsPage
            onBack={() => handleNavigate('dashboard')}
            internalHelp
            onOpenTutorial={slug => handleNavigate('help-article', { slug })}
          />
        );
      case 'help-article':
        return (
          <TutorialPage
            slug={navParams?.slug || ''}
            onBack={() => handleNavigate('help')}
            internalHelp
            onOpenTutorial={slug => handleNavigate('help-article', { slug })}
          />
        );
      case 'profile': return <Settings user={user} onBack={() => handleNavigate('dashboard')} onNavigate={handleNavigate} />;
      case 'employees': return <EmployeeDirectory user={user} onNavigate={handleNavigate} />;
      case 'employee-new':
        return <EmployeeOnboarding user={user} mode="create" onNavigate={handleNavigate} />;
      case 'employee-edit':
        return (
          <EmployeeOnboarding
            user={user}
            mode="edit"
            employeeId={navParams?.employeeId}
            onNavigate={handleNavigate}
          />
        );
      case 'employee-view':
        return (
          <EmployeeOnboarding
            user={user}
            mode="view"
            employeeId={navParams?.employeeId}
            onNavigate={handleNavigate}
          />
        );
      case 'employee-admission':
        return (
          <EmployeeLifecyclePage
            user={user}
            mode="admission"
            employeeId={navParams?.employeeId}
            onNavigate={handleNavigate}
          />
        );
      case 'employee-discharge':
        return (
          <EmployeeLifecyclePage
            user={user}
            mode="discharge"
            employeeId={navParams?.employeeId}
            onNavigate={handleNavigate}
          />
        );
      case 'attendance':
        if (isPjContractor(user) || (needsClockAdmission(user) && employeeMobileShell)) {
          return <Dashboard user={user} onNavigate={handleNavigate} />;
        }
        if (user.role === 'ADMIN' || user.role === 'HR') {
          return <Dashboard user={user} onNavigate={handleNavigate} />;
        }
        return (
          <ErrorBoundary>
            <Attendance
              user={user}
              autoStart={navParams?.autoStart}
              onFinish={() => handleNavigate('dashboard')}
            />
          </ErrorBoundary>
        );
      case 'attendance-logs':
        if (user.role === 'ADMIN' || user.role === 'HR') {
          return <AttendanceLogs user={user} viewMode="AUDIT" />;
        }
        return <AttendanceLogs user={user} viewMode="MY" />;
      case 'attendance-audit': return <AttendanceLogs user={user} viewMode="AUDIT" />;
      case 'timesheet': return <Timesheet user={user} onNavigate={handleNavigate} />;
      case 'my-timesheet':
        if (isPjContractor(user)) {
          return <MyRoster user={user} onNavigate={handleNavigate} />;
        }
        if (needsClockAdmission(user)) {
          return <MyTimesheet user={user} onNavigate={handleNavigate} />;
        }
        return <Timesheet user={user} onNavigate={handleNavigate} />;
      case 'my-roster':
        if (canAccessMyRoster(user)) {
          return <MyRoster user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;
      case 'payroll': return <Payroll user={user} onNavigate={handleNavigate} />;
      case 'ponto':
        if (['ADMIN', 'HR', 'MANAGER', 'TEAM_LEAD', 'MANAGEMENT'].includes(user.role)) {
          return <PontoHub user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;
      case 'apuracao':
        if (user.role === 'ADMIN' || user.role === 'HR') {
          return <Apuracao user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;
      case 'comunicacao':
        if (user.role === 'ADMIN') {
          return <Comunicacao user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;
      case 'roster':
        if (user.role === 'ADMIN' || user.role === 'HR' || user.role === 'MANAGER') {
          return <WorkRoster user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;
      case 'leave': return <Leave user={user} autoOpen={navParams?.autoOpen} />;
      case 'announcements': return <Announcements user={user} />;
      case 'admin-notifications': return <AdminNotifications user={user} />;
      case 'messaging-outbox':
        if (user.role === 'ADMIN' || user.role === 'HR') {
          return <MessagingOutbox />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;
      case 'performance-review': return <PerformanceReview user={user} />;
      case 'settings':
        if (user.role === 'ADMIN') {
          return <Settings user={user} onNavigate={handleNavigate} />;
        }
        return <Settings user={user} onBack={() => handleNavigate('dashboard')} onNavigate={handleNavigate} />;
      case 'reports': return <Reports user={user} onNavigate={handleNavigate} />;
      case 'organization': return <Organization initialTab={navParams?.tab} />;
      default: return <Dashboard user={user} onNavigate={handleNavigate} />;
    }
  };

  const suspenseFallback = (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50">
      <Loader2 className="animate-spin text-primary" size={48} />
    </div>
  );

  const pushPrompt = !isSuperAdmin ? (
    <PushPermissionPrompt userId={user.id} organizationId={user.organizationId as string | undefined} />
  ) : null;

  if (currentPath === 'attendance') {
    return (
      <>
        <Suspense fallback={suspenseFallback}>{renderContent()}</Suspense>
        {pushPrompt}
      </>
    );
  }

  return (
    <MainLayout currentPath={currentPath} onNavigate={handleNavigate}>
      <Suspense fallback={suspenseFallback}>{renderContent()}</Suspense>
      {pushPrompt}
    </MainLayout>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <ThemeProvider>
          <ToastProvider>
            <SearchProvider>
              <AppContent />
              <SearchDialog />
              <Analytics />
              <CookieConsent />
              <PWAUpdateBanner />
            </SearchProvider>
          </ToastProvider>
        </ThemeProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
};

export default App;
