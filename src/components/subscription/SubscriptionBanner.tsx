import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '../../context/SubscriptionContext';
import { AlertTriangle, Clock } from 'lucide-react';

interface SubscriptionBannerProps {
  onUpgradeClick?: () => void;
  userRole?: string;
}

export const SubscriptionBanner: React.FC<SubscriptionBannerProps> = ({ onUpgradeClick, userRole }) => {
  const { t } = useTranslation('subscription');
  const { subscription, isLoading } = useSubscription();

  if (isLoading) return null;
  if (!subscription || subscription.isSuperAdmin) return null;

  const canUpgrade = userRole === 'ADMIN' || userRole === 'HR';

  if (subscription.status === 'TRIAL' && subscription.daysRemaining !== undefined) {
    const isUrgent = subscription.daysRemaining <= 3;

    return (
      <div className={`px-4 py-2 flex items-center justify-between text-sm ${
        isUrgent
          ? 'bg-red-50 border-b border-red-200 text-red-700'
          : 'bg-amber-50 border-b border-amber-200 text-amber-700'
      }`}>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span>
            {subscription.daysRemaining === 0
              ? t('trialExpiresToday')
              : subscription.daysRemaining === 1
                ? t('trialOneDay')
                : t('trialDays', { count: subscription.daysRemaining })
            }
            {!canUpgrade && t('contactAdminUpgrade')}
          </span>
        </div>
        {canUpgrade && (
          <button
            onClick={onUpgradeClick}
            className="px-3 py-1 bg-primary text-white rounded text-xs font-medium hover:bg-primary-hover transition-colors"
          >
            {t('upgradeNow')}
          </button>
        )}
      </div>
    );
  }

  if (subscription.status === 'EXPIRED') {
    return (
      <div className="px-4 py-2 flex items-center justify-between text-sm bg-red-50 border-b border-red-200 text-red-700">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>
            {canUpgrade ? t('expiredAdmin') : t('expiredUser')}
          </span>
        </div>
        {canUpgrade && (
          <button
            onClick={onUpgradeClick}
            className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors"
          >
            {t('upgradeToContinue')}
          </button>
        )}
      </div>
    );
  }

  return null;
};
