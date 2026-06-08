import React from 'react';
import { Check, ArrowRight } from 'lucide-react';

interface PricingSectionProps {
  onRegisterClick: () => void;
}

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for small teams getting started with HR management.',
    features: [
      'Up to 10 employees',
      'Selfie-based attendance tracking',
      'Leave management',
      'Employee directory',
      'Basic reports',
      'PWA mobile app',
      'Ad-supported',
    ],
    cta: 'Get Started Free',
    featured: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'For growing organizations that need advanced HR features.',
    features: [
      'Up to 100 employees',
      'Everything in Free',
      'Advanced analytics & reports',
      'Performance reviews',
      'Custom leave policies',
      'Priority email support',
      'No ads',
      'Data export',
    ],
    cta: 'Start Free Trial',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: '$99',
    period: '/month',
    description: 'For large organizations with complex HR requirements.',
    features: [
      'Unlimited employees',
      'Everything in Pro',
      'Multi-location support',
      'Custom integrations',
      'Dedicated account manager',
      'SSO / SAML',
      'Audit logs',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    featured: false,
  },
];

const PricingSection: React.FC<PricingSectionProps> = ({ onRegisterClick }) => {
  return (
    <section id="pricing" className="py-20 md:py-28 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold text-primary uppercase tracking-wide">Pricing</span>
          <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white mt-3 mb-4">
            Plans for Teams of All Sizes
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg">
            Start free and upgrade as you grow. All plans include a 14-day free trial of Pro features — no credit card required.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-6 lg:p-8 flex flex-col ${
                plan.featured
                  ? 'bg-primary text-white ring-4 ring-primary/20 shadow-xl shadow-primary/10 scale-[1.02]'
                  : 'bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700'
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-full">
                  Most Popular
                </div>
              )}
              <div className="mb-6">
                <h3 className={`text-lg font-bold mb-1 ${plan.featured ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm ${plan.featured ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>
                  {plan.description}
                </p>
              </div>
              <div className="mb-6">
                <span className={`text-4xl font-bold ${plan.featured ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  {plan.price}
                </span>
                <span className={`text-sm font-medium ${plan.featured ? 'text-white/60' : 'text-slate-400'}`}>
                  {plan.period}
                </span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check
                      size={16}
                      className={`mt-0.5 flex-shrink-0 ${
                        plan.featured ? 'text-white' : 'text-emerald-500'
                      }`}
                    />
                    <span className={`text-sm font-medium ${plan.featured ? 'text-white/90' : 'text-slate-600 dark:text-slate-300'}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={onRegisterClick}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  plan.featured
                    ? 'bg-white text-primary hover:bg-slate-50 shadow-sm'
                    : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100'
                }`}
              >
                {plan.cta} <ArrowRight size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
