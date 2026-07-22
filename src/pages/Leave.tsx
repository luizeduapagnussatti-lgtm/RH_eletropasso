
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertTriangle } from 'lucide-react';
import { hrService } from '../services/hrService';
import { LeaveRequest, LeaveBalance } from '../types';
import { useSubscription } from '../context/SubscriptionContext';
import { tRole } from '../i18n/statusMaps';
import { isNonPunchingStaff, isStaffAdmin } from '../utils/roles';

// New Modules
import { LeaveGuidelines } from '../components/leave/LeaveGuidelines';
import EmployeeLeaveModule from '../components/leave/EmployeeLeaveModule';
import ManagerialLeaveModule from '../components/leave/ManagerialLeaveModule';
import { HRLeaveModule } from '../components/leave/HRLeaveModule';

interface LeaveProps {
  user: any;
  autoOpen?: boolean;
}

const Leave: React.FC<LeaveProps> = ({ user, autoOpen }) => {
  const { t } = useTranslation('leave');
  const isAdmin = isStaffAdmin(user.role);
  const isManager = user.role === 'MANAGER' || user.role === 'TEAM_LEAD' || user.role === 'MANAGEMENT';
  const showPersonalLeave = !isNonPunchingStaff(user.role);

  // Subscription check
  const { canPerformAction, subscription } = useSubscription();
  const canWrite = canPerformAction('write');

  const [isInitializing, setIsInitializing] = useState(true);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);

  const refreshData = async () => {
    try {
      const [fetchedLeaves, userBalance] = await Promise.all([
        hrService.getLeaves(),
        hrService.getLeaveBalance(user.id)
      ]);
      setLeaves(fetchedLeaves);
      setBalance(userBalance);
    } catch (e) { 
      console.error("Refresh failed", e); 
    } finally { 
      setIsInitializing(false); 
    }
  };

  useEffect(() => { 
    setIsInitializing(true);
    refreshData(); 
  }, [user.id]);

  if (isInitializing) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">

      {/* Subscription Warning */}
      {!canWrite && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">
            {subscription?.status === 'EXPIRED'
              ? t('readOnlyExpired')
              : t('readOnlySuspended')}
          </span>
        </div>
      )}

      {/* 1. Global Guidelines Display */}
      <LeaveGuidelines role={user.role} />

      {/* 2. Employee Module — managers/employees (Admin/HR administer others) */}
      {showPersonalLeave && (
        <EmployeeLeaveModule
          user={user}
          balance={balance}
          history={leaves.filter(l => l.employeeId === user.id)}
          onRefresh={refreshData}
          initialOpen={autoOpen}
          readOnly={!canWrite}
        />
      )}

      {/* 3. Managerial Module (Team Leads, Managers, Directors) */}
      {isManager && (
        <div className="pt-12 border-t border-slate-100">
          <ManagerialLeaveModule
            user={user}
            requests={leaves}
            onRefresh={refreshData}
            roleLabel={tRole(user.role)}
            readOnly={!canWrite}
          />
        </div>
      )}

      {/* 4. HR/Admin Module (Compliance) */}
      {isAdmin && (
        <div className={showPersonalLeave || isManager ? 'pt-12 border-t border-slate-100' : ''}>
          <HRLeaveModule
            user={user}
            requests={leaves}
            onRefresh={refreshData}
            readOnly={!canWrite}
          />
        </div>
      )}
    </div>
  );
};

export default Leave;
