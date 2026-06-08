import React from 'react';
import { Quote, Building2, Users, Activity } from 'lucide-react';

const stats = [
  { icon: Building2, value: '50+', label: 'Organizations' },
  { icon: Users, value: '1,000+', label: 'Employees Managed' },
  { icon: Activity, value: '99.9%', label: 'Uptime' },
];

const testimonials = [
  {
    quote: "OpenHRApp transformed how we manage our team. Attendance tracking went from spreadsheets to a one-click selfie check-in. Our HR department saves hours every week.",
    name: 'Rajesh Kumar',
    role: 'HR Manager, TechCorp Solutions',
    initials: 'RK',
  },
  {
    quote: "We evaluated 5 different HR platforms before choosing OpenHRApp. The selfie-based attendance and GPS tracking eliminated buddy punching overnight. Highly recommend for any growing business.",
    name: 'Sarah Chen',
    role: 'Operations Director, Nexus Labs',
    initials: 'SC',
  },
  {
    quote: "As a non-profit, we needed a free HR solution that didn't compromise on features. OpenHRApp's leave management and employee directory are exactly what we needed. The PWA works great on our field staff's phones.",
    name: 'David Okafor',
    role: 'Executive Director, GreenPath Initiative',
    initials: 'DO',
  },
];

const TestimonialsSection: React.FC = () => {
  return (
    <section className="py-20 md:py-28 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold text-primary uppercase tracking-wide">Testimonials</span>
          <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white mt-3 mb-4">
            Trusted by Growing Teams
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg">
            See why organizations choose OpenHRApp for their HR management needs.
          </p>
        </div>

        {/* Testimonial Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl p-6 md:p-8 relative">
              <Quote size={28} className="text-primary/20 absolute top-5 left-5" aria-hidden="true" />
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-4 h-4 text-amber-400 fill-amber-400" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-5 relative z-10">
                "{t.quote}"
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-primary font-bold text-sm">{t.initials}</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{t.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <stat.icon size={20} className="text-primary mx-auto mb-3" aria-hidden="true" />
              <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
              <p className="text-xs font-semibold text-slate-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
