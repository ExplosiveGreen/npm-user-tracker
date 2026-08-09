import '@/global.css';
import "react-native-random-uuid";
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { registerTaskAsync } from 'expo-background-task';
import '@/lib/tasks';
import { SCAN_TASK_NAME } from '@/lib/tasks';

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    registerTaskAsync(SCAN_TASK_NAME, {}).catch((error) => {
      console.warn('Background task registration skipped', error);
    });
  }, []);

  return (
    <>
      <Stack />
      <PortalHost />
    </>
  );
}