import { useEffect, useState } from 'react';
import { AppRouter } from '@/routes';
import { useAuthStore } from '@/auth/auth.store';
import { ToastViewport } from '@/components/ToastViewport';
import { Spinner } from '@/components/Spinner';
import { applyAdminTheme, useUiStore } from '@/stores/ui.store';

export function App() {
  const restore = useAuthStore((s) => s.restore);
  const loading = useAuthStore((s) => s.loading);
  const theme = useUiStore((s) => s.theme);
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    applyAdminTheme(theme);
  }, [theme]);

  useEffect(() => {
    const unsubUi = useUiStore.persist.onFinishHydration((state) => {
      applyAdminTheme(state?.theme || 'dark');
    });
    if (useUiStore.persist.hasHydrated()) applyAdminTheme(useUiStore.getState().theme);
    return unsubUi;
  }, []);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  useEffect(() => {
    if (hydrated) void restore();
  }, [hydrated, restore]);

  if (!hydrated || loading) return <Spinner />;

  return (
    <>
      <AppRouter />
      <ToastViewport />
    </>
  );
}
