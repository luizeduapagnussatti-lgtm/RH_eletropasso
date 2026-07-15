import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonEn from '../locales/en/common.json';
import navEn from '../locales/en/nav.json';
import statusEn from '../locales/en/status.json';
import authEn from '../locales/en/auth.json';
import dashboardEn from '../locales/en/dashboard.json';
import attendanceEn from '../locales/en/attendance.json';
import leaveEn from '../locales/en/leave.json';
import orgEn from '../locales/en/org.json';
import settingsEn from '../locales/en/settings.json';
import reviewEn from '../locales/en/review.json';
import announcementsEn from '../locales/en/announcements.json';
import notificationsEn from '../locales/en/notifications.json';
import employeesEn from '../locales/en/employees.json';
import reportsEn from '../locales/en/reports.json';
import subscriptionEn from '../locales/en/subscription.json';
import onboardingEn from '../locales/en/onboarding.json';
import superadminEn from '../locales/en/superadmin.json';
import marketingEn from '../locales/en/marketing.json';
import emailsEn from '../locales/en/emails.json';

import commonPt from '../locales/pt-BR/common.json';
import navPt from '../locales/pt-BR/nav.json';
import statusPt from '../locales/pt-BR/status.json';
import authPt from '../locales/pt-BR/auth.json';
import dashboardPt from '../locales/pt-BR/dashboard.json';
import attendancePt from '../locales/pt-BR/attendance.json';
import leavePt from '../locales/pt-BR/leave.json';
import orgPt from '../locales/pt-BR/org.json';
import settingsPt from '../locales/pt-BR/settings.json';
import reviewPt from '../locales/pt-BR/review.json';
import announcementsPt from '../locales/pt-BR/announcements.json';
import notificationsPt from '../locales/pt-BR/notifications.json';
import employeesPt from '../locales/pt-BR/employees.json';
import reportsPt from '../locales/pt-BR/reports.json';
import subscriptionPt from '../locales/pt-BR/subscription.json';
import onboardingPt from '../locales/pt-BR/onboarding.json';
import superadminPt from '../locales/pt-BR/superadmin.json';
import marketingPt from '../locales/pt-BR/marketing.json';
import emailsPt from '../locales/pt-BR/emails.json';

export const NAMESPACES = [
  'common',
  'nav',
  'status',
  'auth',
  'dashboard',
  'attendance',
  'leave',
  'org',
  'settings',
  'review',
  'announcements',
  'notifications',
  'employees',
  'reports',
  'subscription',
  'onboarding',
  'superadmin',
  'marketing',
  'emails',
] as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: commonEn,
        nav: navEn,
        status: statusEn,
        auth: authEn,
        dashboard: dashboardEn,
        attendance: attendanceEn,
        leave: leaveEn,
        org: orgEn,
        settings: settingsEn,
        review: reviewEn,
        announcements: announcementsEn,
        notifications: notificationsEn,
        employees: employeesEn,
        reports: reportsEn,
        subscription: subscriptionEn,
        onboarding: onboardingEn,
        superadmin: superadminEn,
        marketing: marketingEn,
        emails: emailsEn,
      },
      'pt-BR': {
        common: commonPt,
        nav: navPt,
        status: statusPt,
        auth: authPt,
        dashboard: dashboardPt,
        attendance: attendancePt,
        leave: leavePt,
        org: orgPt,
        settings: settingsPt,
        review: reviewPt,
        announcements: announcementsPt,
        notifications: notificationsPt,
        employees: employeesPt,
        reports: reportsPt,
        subscription: subscriptionPt,
        onboarding: onboardingPt,
        superadmin: superadminPt,
        marketing: marketingPt,
        emails: emailsPt,
      },
    },
    fallbackLng: 'pt-BR',
    supportedLngs: ['pt-BR', 'en'],
    ns: [...NAMESPACES],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'openhr_lang',
      caches: ['localStorage'],
    },
    react: { useSuspense: false },
  });

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
  }
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language || 'pt-BR';
}

export default i18n;

export function setAppLanguage(lng: 'pt-BR' | 'en'): void {
  void i18n.changeLanguage(lng);
}
