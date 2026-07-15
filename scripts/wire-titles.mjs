import fs from 'fs';

const ops = [
  {
    file: 'src/pages/Organization.tsx',
    ns: null, // already has hook
    replace: [['Organization & Setup', "{t('title')}"]],
  },
  {
    file: 'src/pages/Announcements.tsx',
    ns: 'announcements',
    replace: [['>Announcements</h1>', ">{t('title')}</h1>"]],
  },
  {
    file: 'src/pages/AdminNotifications.tsx',
    ns: 'notifications',
    replace: [['>Notifications</h1>', ">{t('title')}</h1>"]],
  },
  {
    file: 'src/pages/Upgrade.tsx',
    ns: 'subscription',
    replace: [['Upgrade Your Plan', "{t('upgradeTitle')}"]],
  },
  {
    file: 'src/pages/Setup.tsx',
    ns: 'auth',
    replace: [['Backend Setup', "{t('setupTitle')}"]],
  },
  {
    file: 'src/pages/Reports.tsx',
    ns: 'reports',
    replace: [['Audit & Reports', "{t('title')}"]],
  },
  {
    file: 'src/pages/PrivacyPolicyPage.tsx',
    ns: 'marketing',
    replace: [['>Privacy Policy</h1>', ">{t('privacy')}</h1>"]],
  },
  {
    file: 'src/pages/TermsOfServicePage.tsx',
    ns: 'marketing',
    replace: [['>Terms of Service</h1>', ">{t('terms')}</h1>"]],
  },
];

for (const op of ops) {
  let s = fs.readFileSync(op.file, 'utf8');
  let changed = false;
  for (const [from, to] of op.replace) {
    if (s.includes(from)) {
      s = s.replace(from, to);
      changed = true;
    } else {
      console.log('missing string in', op.file, from);
    }
  }
  if (!changed) continue;

  if (op.ns && !s.includes('useTranslation')) {
    s = s.replace(/from 'react';\r?\n/, (m) => `${m}import { useTranslation } from 'react-i18next';\n`);
    const already = /const \{ t \} = useTranslation/.test(s);
    if (!already) {
      const patterns = [
        /(const \w+: React\.FC[^=]*= \([^)]*\) => \{\r?\n)/,
        /(const \w+ = \([^)]*\) => \{\r?\n)/,
        /(function \w+\([^)]*\) \{\r?\n)/,
      ];
      for (const re of patterns) {
        if (re.test(s)) {
          s = s.replace(re, `$1  const { t } = useTranslation('${op.ns}');\n`);
          break;
        }
      }
    }
  }

  fs.writeFileSync(op.file, s);
  console.log('ok', op.file);
}
