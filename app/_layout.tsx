import '@/global.css';
import "react-native-random-uuid";
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { registerTaskAsync } from 'expo-background-task';
import '@/lib/tasks';
import { ThemeProvider, useTheme } from '@/lib/theme-provider';
import { THEME } from '@/lib/theme';
import { SCAN_TASK_NAME } from '@/lib/tasks';

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
    registerTaskAsync(SCAN_TASK_NAME, {}).catch((error) => {
      console.warn('Background task registration skipped', error);
    });
  }, []);

  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}