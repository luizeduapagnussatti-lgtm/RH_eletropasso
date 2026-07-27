import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  EMPLOYEE_MOBILE_MAX_WIDTH,
  shouldUseEmployeeMobileShell,
} from '../utils/mobileShell';

export function useEmployeeMobileShell(): boolean {
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${EMPLOYEE_MOBILE_MAX_WIDTH}px)`).matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${EMPLOYEE_MOBILE_MAX_WIDTH}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return shouldUseEmployeeMobileShell(user?.role, isMobile);
}
