import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { SubscriptionInfo } from '../types';
import { useAuth } from './AuthContext';

interface SubscriptionContextType {
  subscription: SubscriptionInfo | null;
  isLoading: boolean;
  refreshSubscription: () => Promise<void>;
  canPerformAction: (action: 'write' | 'read') => boolean;
}

/** Eletropasso single-tenant: subscription SaaS disabled — always full access. */
const ELETROPASSO_ACTIVE: SubscriptionInfo = {
  status: 'ACTIVE',
  isSuperAdmin: false,
  isReadOnly: false,
  isBlocked: false,
  showAds: false,
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const subscription: SubscriptionInfo | null = user
    ? { ...ELETROPASSO_ACTIVE, isSuperAdmin: user.role === 'SUPER_ADMIN' }
    : null;

  const refreshSubscription = useCallback(async () => {
    /* no-op — Eletropasso does not fetch trial/upgrade status */
  }, []);

  const canPerformAction = useCallback((_action: 'write' | 'read') => true, []);

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        isLoading: false,
        refreshSubscription,
        canPerformAction,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
};
