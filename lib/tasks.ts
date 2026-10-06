import { BackgroundTaskResult, registerTaskAsync, unregisterTaskAsync } from 'expo-background-task';
import { defineTask } from 'expo-task-manager';
import { Platform } from 'react-native';
import { getPref, setPref } from '@/lib/prefs';
import { runBackgroundScan } from '@/lib/script';

export const SCAN_TASK_NAME = 'scan-npm-users';

const SCAN_INTERVAL_KEY = 'scan-interval-minutes';
export const DEFAULT_SCAN_INTERVAL_MINUTES = 60;
// Android enforces a 15-minute floor and batches jobs to save battery; iOS
// decides its own windows (often once a day) no matter what is requested.
export const MIN_SCAN_INTERVAL_MINUTES = 15;

export const SCAN_INTERVAL_UNITS = [
  { unit: 'minutes', label: 'Minutes', factor: 1 },
  { unit: 'hours', label: 'Hours', factor: 60 },
  { unit: 'days', label: 'Days', factor: 1440 },
  { unit: 'weeks', label: 'Weeks', factor: 10_080 },
  { unit: 'months', label: 'Months', factor: 43_200 },
] as const;

export type ScanIntervalUnit = (typeof SCAN_INTERVAL_UNITS)[number]['unit'];

export function getScanIntervalMinutes(): number {
  const stored = Number(getPref(SCAN_INTERVAL_KEY));
  if (Number.isInteger(stored) && stored >= MIN_SCAN_INTERVAL_MINUTES) return stored;
  return DEFAULT_SCAN_INTERVAL_MINUTES;
}

// Persists the schedule and re-registers the OS task so the new interval
// applies without restarting the app.
export async function setScanIntervalMinutes(minutes: number): Promise<void> {
  if (!Number.isInteger(minutes) || minutes < MIN_SCAN_INTERVAL_MINUTES) {
    throw new Error(`Scan interval must be at least ${MIN_SCAN_INTERVAL_MINUTES} minutes`);
  }
  setPref(SCAN_INTERVAL_KEY, String(minutes));
  await registerScanTask();
}

export async function registerScanTask(): Promise<void> {
  if (Platform.OS === 'web') return;
  const minimumInterval = getScanIntervalMinutes();
  try {
    await unregisterTaskAsync(SCAN_TASK_NAME);
  } catch {
    // Not registered yet — nothing to remove.
  }
  await registerTaskAsync(SCAN_TASK_NAME, { minimumInterval });
}

// Defined at module scope so the task is available even when its consuming
// screen is not mounted. Each run recovers interrupted work, sweeps every
// enabled user (the enable switch is the notification opt-out), and holds the
// OS execution window until version histories drain — so scans happen on the
// OS schedule even when the app is closed, and closing the app mid-scan just
// hands the job to the next background run instead of losing it.
if (Platform.OS !== 'web') {
  defineTask(SCAN_TASK_NAME, async () => {
    try {
      await runBackgroundScan();
      return BackgroundTaskResult.Success;
    } catch (error) {
      console.error('Failed to run background scan task', error);
      return BackgroundTaskResult.Failed;
    }
  });
}
