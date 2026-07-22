import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

type FaqGroup = {
  category: string;
  items: Array<{ q: string; a: string }>;
};

const FAQSection: React.FC = () => {
  const { t } = useTranslation('marketing');
  const [openIndex, setOpenIndex] = useState<string | null>(null);
  const groups = t('faq.groups', { returnObjects: true }) as FaqGroup[];

  const toggle = (key: string) => {
    setOpenIndex(openIndex === key ? null : key);
  };

  return (
    <section id="faq" className="py-20 md:py-28 bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-xs font-bold text-primary uppercase tracking-wide">{t('faqSection.eyebrow')}</span>
          <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 mt-3 mb-4">
            {t('faqSection.title')}
          </h2>
          <p className="text-slate-500 text-lg">
            {t('faqSection.subtitle')}
          </p>
        </div>

        <div className="space-y-8">
          {Array.isArray(groups) && groups.map((group) => (
            <div key={group.category}>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 px-1">
                {group.category}
              </h3>
              <div className="space-y-2">
                {group.items.map((item, idx) => {
                  const key = `${group.category}-${idx}`;
                  const isOpen = openIndex === key;
                  return (
                    <div
                      key={key}
                      className="bg-white border border-slate-100 rounded-xl overflow-hidden"
                    >
                      <button
                        onClick={() => toggle(key)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="text-sm font-semibold text-slate-800 pr-4">{item.q}</span>
                        <ChevronDown
                          size={16}
                          aria-hidden="true"
                          className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-4 animate-in fade-in duration-200">
                          <p className="text-sm text-slate-500 leading-relaxed">{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
