import React from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import MessagingOutboxPanel from '../components/messaging/MessagingOutboxPanel';

const MessagingOutbox: React.FC = () => {
  const { t } = useTranslation('messaging');

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex items-center gap-2">
        <Send className="text-primary" size={22} />
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
          <p className="text-sm text-slate-500">{t('subtitle')}</p>
        </div>
      </header>
      <MessagingOutboxPanel />
    </div>
  );
};

export default MessagingOutbox;
