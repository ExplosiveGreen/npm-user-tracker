import { BackgroundTaskResult } from 'expo-background-task';
import { defineTask } from 'expo-task-manager';
import { Platform } from 'react-native';
import { jobsCollection, npmUsersCollection } from '@/db';
import { processJob } from '@/lib/script';

export const SCAN_TASK_NAME = 'scan-npm-users';
// Hourly is frequent enough for npm releases without draining the battery;
// Android enforces a 15-minute minimum, iOS decides its own windows.
export const SCAN_TASK_INTERVAL_MINUTES = 60;

// Defined at module scope so the task is available even when its consuming
// screen is not mounted. Reads back any jobs that are still queued (e.g. ones
// scheduled while the app was away) and runs them to completion. Disabled
// users are skipped — the enable switch is the notification opt-out.
if (Platform.OS !== 'web') {
  defineTask(SCAN_TASK_NAME, async () => {
    try {
      await jobsCollection.preload();
      await npmUsersCollection.preload();
      const enabledIds = new Set(
        npmUsersCollection.toArray.filter((user) => user.enable).map((user) => user.id),
      );
      const queued = jobsCollection.toArray.filter(
        (job) => job.status === 'queued' && enabledIds.has(job.npmUserId),
      );
      for (const job of queued) {
        await processJob(job.id);
      }
      return BackgroundTaskResult.Success;
    } catch (error) {
      console.error('Failed to run background scan task', error);
      return BackgroundTaskResult.Failed;
    }
  });
}