import '@/global.css';
import "react-native-random-uuid";
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import '@/lib/tasks';
import { ThemeProvider, useTheme } from '@/lib/theme-provider';
import { THEME } from '@/lib/theme';
import { refreshCollections } from '@/db';
import { recoverInterruptedScans } from '@/lib/script';
import { registerScanTask } from '@/lib/tasks';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

function ThemedRoot() {
  const { resolved } = useTheme();

  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTintColor: THEME[resolved].foreground,
          headerStyle: { backgroundColor: THEME[resolved].background },
          contentStyle: { backgroundColor: THEME[resolved].background },
        }}
      />
      <PortalHost />
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    // Registers the OS-scheduled scan with the user's saved interval, so
    // tracking continues even when the app is closed.
    registerScanTask().catch((error) => {
      console.warn('Background task registration skipped', error);
    });
    // Requeues anything a killed session left behind (stale running jobs go
    // back to queued; the background task does the actual running).
    recoverInterruptedScans().catch((error) => {
      console.warn('Interrupted scan recovery skipped', error);
    });
    // The background task writes SQLite from a runtime that shares no memory
    // with this one: reload collections every foregrounding so rows the
    // background changed (job outcomes, new packages) actually appear.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshCollections().catch((error) => {
          console.warn('Collection refresh skipped', error);
        });
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}