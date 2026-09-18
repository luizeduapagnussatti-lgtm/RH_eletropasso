import { useCallback, useEffect, useState } from 'react';
import type { Employee, User } from '../../types';
import { hrService } from '../../services/hrService';
import { competenceForDate, normalizePeriodStartDay } from '../../utils/payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../../constants';
import { validateTimesheetEmployeeReview } from '../../utils/timesheetReviewValidation';
import {
  loadTimesheetDaysForEmployee,
  resolveEmployeeKeys,
} from '../../utils/timesheetEmployeeKeys';

function shiftCompetence(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * True when a recent competence is available for the employee to sign.
 * Never upserts reviews (EMPLOYEE has no INSERT on timesheet_employee_reviews).
 */
export function usePendingTimesheetSign(user?: User | null): boolean {
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setPending(false);
      return;
    }
    try {
      let startDay = DEFAULT_PTRP_POLICY.periodStartDay;
      try {
        const config = await hrService.getConfig();
        startDay = normalizePeriodStartDay(
          config?.ptrpPolicy?.periodStartDay ?? DEFAULT_PTRP_POLICY.periodStartDay,
        );
      } catch {
        /* keep default */
      }

      const employees = await hrService.getEmployees().catch(() => [] as Employee[]);
      const profile =
        employees.find((e) => e.id === user.id) ||
        employees.find(
          (e) => e.employeeId && e.employeeId === (user as Employee).employeeId,
        ) ||
        null;
      if (profile?.status === 'INACTIVE' || profile?.terminationDate) {
        setPending(false);
        return;
      }
      const keys = resolveEmployeeKeys(user, profile);

      let competence = competenceForDate(new Date(), startDay);

      for (let attempt = 0; attempt < 2; attempt++) {
        const period = await hrService.getOrCreateTimesheetPeriod(
          competence.year,
          competence.month,
        );
        const review = await hrService.getTimesheetEmployeeReview(period.id, user.id);

        if (review?.status === 'APPROVED' || review?.status === 'EMPLOYEE_SIGNED') {
          competence = shiftCompetence(competence.year, competence.month, -1);
          continue;
        }
        if (review?.status === 'IN_REVIEW') {
          setPending(true);
          return;
        }

        const days = await loadTimesheetDaysForEmployee(
          period.id,
          keys.length ? keys : [user.id],
        );
        const eligible = validateTimesheetEmployeeReview(days).canSubmit;
        // Need a review row — employee cannot create it (no INSERT RLS).
        if (eligible && review?.status === 'OPEN') {
          setPending(true);
          return;
        }

        competence = shiftCompetence(competence.year, competence.month, -1);
      }

      setPending(false);
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
