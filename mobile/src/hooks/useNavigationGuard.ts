import { useRef, useCallback } from 'react';

export function useNavigationGuard() {
  const isNavigating = useRef(false);

  const safeNavigate = useCallback((fn: () => void) => {
    if (isNavigating.current) return;
    isNavigating.current = true;
    fn();
    setTimeout(() => {
      isNavigating.current = false;
    }, 500); // enough time for transition to finish
  }, []);

  return { safeNavigate };
}
