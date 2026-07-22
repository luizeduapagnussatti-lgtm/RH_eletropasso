
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { hrService } from '../../services/hrService';
import { AppConfig, Holiday, Team, Shift } from '../../types';

export interface SetupStep {
  id: number;
  title: string;
  description: string;
  navigateTo: string;
  navigateTab?: string;
  tutorialSlug: string;
  completed: boolean;
}

interface SetupCheckData {
  config: AppConfig | null;
  departments: string[];
  teams: Team[];
  shifts: Shift[];
  holidays: Holiday[];
  employeeCount: number;
}

const STEPS_CONFIG = [
  {
    id: 1,
    titleKey: 'steps.companyInfo.title',
    descriptionKey: 'steps.companyInfo.description',
    navigateTo: 'organization',
    navigateTab: 'SYSTEM',
    tutorialSlug: 'setting-up-organization',
    check: (d: SetupCheckData) => !!(d.config?.companyName && d.config.companyName !== 'My Organization' && d.config.companyName.trim() !== ''),
  },
  {
    id: 2,
    titleKey: 'steps.departments.title',
    descriptionKey: 'steps.departments.description',
    navigateTo: 'organization',
    navigateTab: 'STRUCTURE',
    tutorialSlug: 'setting-up-organization',
    check: (d: SetupCheckData) => d.departments.length > 0,
  },
  {
    id: 3,
    titleKey: 'steps.shifts.title',
    descriptionKey: 'steps.shifts.description',
    navigateTo: 'organization',
    navigateTab: 'SHIFTS',
    tutorialSlug: 'setting-up-organization',
    check: (d: SetupCheckData) => d.shifts.length > 0,
  },
  {
    id: 4,
    titleKey: 'steps.locations.title',
    descriptionKey: 'steps.locations.description',
    navigateTo: 'organization',
    navigateTab: 'PLACEMENT',
    tutorialSlug: 'setting-up-organization',
    check: (d: SetupCheckData) => !!(d.config?.officeLocations && d.config.officeLocations.length > 0),
  },
  {
    id: 5,
    titleKey: 'steps.teams.title',
    descriptionKey: 'steps.teams.description',
    navigateTo: 'organization',
    navigateTab: 'TEAMS',
    tutorialSlug: 'setting-up-organization',
    check: (d: SetupCheckData) => d.teams.length > 0,
  },
  {
    id: 6,
    titleKey: 'steps.leavePolicy.title',
    descriptionKey: 'steps.leavePolicy.description',
    navigateTo: 'organization',
    navigateTab: 'LEAVES',
    tutorialSlug: 'understanding-leave-policies',
    check: (d: SetupCheckData) => d.departments.length > 0,
  },
  {
    id: 7,
    titleKey: 'steps.holidays.title',
    descriptionKey: 'steps.holidays.description',
    navigateTo: 'organization',
    navigateTab: 'HOLIDAYS',
    tutorialSlug: 'setting-up-organization',
    check: (d: SetupCheckData) => d.holidays.length > 0,
  },
  {
    id: 8,
    titleKey: 'steps.employees.title',
    descriptionKey: 'steps.employees.description',
    navigateTo: 'employees',
    tutorialSlug: 'managing-employees',
    check: (d: SetupCheckData) => d.employeeCount > 1,
  },
];

export function useSetupChecklist(userRole: string) {
  const { t } = useTranslation('onboarding');
  const [completedByStepId, setCompletedByStepId] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  const isAdminOrHR = userRole === 'ADMIN' || userRole === 'HR';

  const loadStatus = useCallback(async () => {
    if (!isAdminOrHR) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Load onboarding status + org data in parallel
      const [onboardingStatus, config, departments, teams, shifts, holidays, employees] = await Promise.all([
        hrService.getOnboardingStatus(),
        hrService.getConfig(),
        hrService.getDepartments(),
        hrService.getTeams(),
        hrService.getShifts(),
        hrService.getHolidays(),
        hrService.getEmployees(),
      ]);

      if (onboardingStatus?.dismissed) {
        setIsDismissed(true);
        setIsLoading(false);
        return;
      }

      const checkData: SetupCheckData = {
        config,
        departments,
        teams,
        shifts,
        holidays,
        employeeCount: employees.length,
      };

      const completion: Record<number, boolean> = {};
      STEPS_CONFIG.forEach(s => {
        completion[s.id] = s.check(checkData);
      });
      setCompletedByStepId(completion);
    } catch (e) {
      console.warn('[SetupChecklist] Failed to load:', e);
    } finally {
      setIsLoading(false);
    }
  }, [isAdminOrHR]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const dismiss = useCallback(async () => {
    try {
      await hrService.setOnboardingStatus({ dismissed: true });
      setIsDismissed(true);
    } catch (e) {
      console.warn('[SetupChecklist] Failed to dismiss:', e);
    }
  }, []);

  const reEnable = useCallback(async () => {
    try {
      await hrService.setOnboardingStatus({ dismissed: false });
      setIsDismissed(false);
      await loadStatus();
    } catch (e) {
      console.warn('[SetupChecklist] Failed to re-enable:', e);
    }
  }, [loadStatus]);

  const steps: SetupStep[] = useMemo(
    () =>
      STEPS_CONFIG.map(s => ({
        id: s.id,
        title: t(s.titleKey),
        description: t(s.descriptionKey),
        navigateTo: s.navigateTo,
        navigateTab: s.navigateTab,
        tutorialSlug: s.tutorialSlug,
        completed: completedByStepId[s.id] ?? false,
      })),
    [t, completedByStepId]
  );

  const completedCount = steps.filter(s => s.completed).length;
  const totalCount = steps.length;
  const allComplete = completedCount === totalCount && totalCount > 0;
  const currentStep = steps.find(s => !s.completed) || null;

  return {
    steps,
    isLoading,
    isDismissed,
    completedCount,
    totalCount,
    allComplete,
    currentStep,
    dismiss,
    reEnable,
    refresh: loadStatus,
    isAdminOrHR,
  };
}
