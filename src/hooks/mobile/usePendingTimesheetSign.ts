import { useCallback, useEffect, useState } from 'react';
import type { User } from '../../types';
import { hrService } from '../../services/hrService';
import { competenceForDate } from '../../utils/payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../../constants';
import { validateTimesheetEmployeeReview } from '../../utils/timesheetReviewValidation';

/**
 * True when the current competence is available for the employee to sign:
 * manager ciência complete (or review already IN_REVIEW) and not yet signed/approved.
 */
export function usePendingTimesheetSign(user?: User | null): boolean {
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setPending(false);
      return;
    }
    try {
      const competence = competenceForDate(new Date(), DEFAULT_PTRP_POLICY.periodStartDay);
      const period = await hrService.getOrCreateTimesheetPeriod(competence.year, competence.month);
      let review = await hrService.getTimesheetEmployeeReview(period.id, user.id);
      if (review?.status === 'APPROVED' || review?.status === 'EMPLOYEE_SIGNED') {
        setPending(false);
        return;
      }
      if (review?.status === 'IN_REVIEW') {
        setPending(true);
        return;
      }

      const employeeKey = (user as { employeeId?: string }).employeeId || user.id;
      const days = await hrService.listTimesheetDays(period.id, employeeKey);
      const eligible = validateTimesheetEmployeeReview(days).canSubmit;

      if (eligible) {
        review =
          (await hrService.reconcileTimesheetEmployeeReviewAfterManagerAcks(
            period.id,
            user.id,
            user.id,
          )) || review;
      }

      setPending(review?.status === 'IN_REVIEW' || eligible);
    } catch {
      setPending(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
    const unsub = hrService.subscribe(() => {
      void refresh();
    });
    return unsub;
  }, [refresh]);

  return pending;
}
