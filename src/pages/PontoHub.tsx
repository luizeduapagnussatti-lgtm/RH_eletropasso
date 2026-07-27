import React from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, CalendarRange, Calculator, ArrowRight, Radio } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import HelpButton from '../components/onboarding/HelpButton';

interface Props {
  user: { id: string; role: string };
  onNavigate: (path: string, params?: any) => void;
}

interface HubCard {
  key: string;
  icon: LucideIcon;
  step: number;
  titleKey: string;
  descKey: string;
  ctaKey: string;
  route: string;
  params?: Record<string, unknown>;
  roles: string[];
}

const CARDS: HubCard[] = [
  {
    key: 'cards',
    icon: CreditCard,
    step: 1,
    titleKey: 'ponto.cardCardsTitle',
    descKey: 'ponto.cardCardsDesc',
    ctaKey: 'ponto.cardCardsCta',
    route: 'employees',
    roles: ['ADMIN', 'HR', 'MANAGER', 'TEAM_LEAD', 'MANAGEMENT'],
  },
  {
    key: 'mirror',
    icon: CalendarRange,
    step: 2,
    titleKey: 'ponto.cardMirrorTitle',
    descKey: 'ponto.cardMirrorDesc',
    ctaKey: 'ponto.cardMirrorCta',
    route: 'timesheet',
    roles: ['ADMIN', 'HR', 'MANAGER', 'TEAM_LEAD', 'MANAGEMENT', 'EMPLOYEE'],
  },
  {
    key: 'apuracao',
    icon: Calculator,
    step: 3,
    titleKey: 'ponto.cardApuracaoTitle',
    descKey: 'ponto.cardApuracaoDesc',
    ctaKey: 'ponto.cardApuracaoCta',
    route: 'apuracao',
    roles: ['ADMIN', 'HR'],
  },
];

const PontoHub: React.FC<Props> = ({ user, onNavigate }) => {
  const { t } = useTranslation('hub');
  const cards = CARDS.filter(c => c.roles.includes(user.role));
  const isAdminHr = user.role === 'ADMIN' || user.role === 'HR';

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{t('ponto.title')}</h1>
          <HelpButton topic="ponto.hub" />
        </div>
        <p className="text-sm text-slate-500 mt-1">{t('ponto.subtitle')}</p>
      </div>

      {/* 3-step flow strip */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-3">
          {t('ponto.flowTitle')}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[t('ponto.flowStep1'), t('ponto.flowStep2'), t('ponto.flowStep3')].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                {i + 1}
              </span>
              <p className="text-sm text-slate-600 leading-snug pt-0.5">{step}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(card => (
          <button
            key={card.key}
            type="button"
            onClick={() => onNavigate(card.route, card.params)}
            className="group text-left rounded-2xl border border-slate-100 bg-white p-6 transition-all hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <card.icon size={24} />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">
                {card.step}/3
              </span>
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">{t(card.titleKey)}</h2>
            <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{t(card.descKey)}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              {t(card.ctaKey)}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>

      {isAdminHr && (
        <button
          type="button"
          onClick={() => onNavigate('comunicacao')}
          className="flex w-full items-center gap-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-left transition-colors hover:bg-sky-100"
        >
          <Radio size={18} className="shrink-0 text-sky-700" />
          <span className="text-sm text-sky-950">{t('ponto.commHint')}</span>
          <ArrowRight size={16} className="ml-auto shrink-0 text-sky-700" />
        </button>
      )}
    </div>
  );
};

export default PontoHub;
