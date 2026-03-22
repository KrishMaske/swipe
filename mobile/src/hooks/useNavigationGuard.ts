import { useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export function useNavigationGuard() {
  const isNavigating = useRef(false);

  // Reset the lock when this screen regains focus
  // (i.e. after a pushed formSheet/modal is dismissed)
  useFocusEffect(
    useCallback(() => {
      isNavigating.current = false;
    }, [])
  );

  const safeNavigate = useCallback((fn: () => void) => {
    if (isNavigating.current) return;
    isNavigating.current = true;
    fn();
    // Fallback timer in case focus event doesn't fire (e.g. WebBrowser)
    setTimeout(() => {
      isNavigating.current = false;
    }, 1500);
  }, []);

  return { safeNavigate, isNavigating };
}
