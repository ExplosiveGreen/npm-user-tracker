import '@/global.css';
import "react-native-random-uuid";
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import '@/lib/tasks';
import { ThemeProvider, useTheme } from '@/lib/theme-provider';
import { THEME } from '@/lib/theme';
import { recoverInterruptedScans } from '@/lib/script';
import { registerScanTask } from '@/lib/tasks';

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
  }, []);

  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}