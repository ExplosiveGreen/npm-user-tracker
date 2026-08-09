import { BackgroundTaskResult } from 'expo-background-task';
import { defineTask } from 'expo-task-manager';
import { Platform } from 'react-native';
import { jobsCollection } from '@/db';
import { processJob } from '@/lib/script';

export const SCAN_TASK_NAME = 'scan-npm-users';

// Defined at module scope so the task is available even when its consuming
// screen is not mounted. Reads back any jobs that are still queued (e.g. ones
// scheduled while the app was away) and runs them to completion.
if (Platform.OS !== 'web') {
  defineTask(SCAN_TASK_NAME, async () => {
    try {
      await jobsCollection.preload();
      const queued = jobsCollection.toArray.filter((job) => job.status === 'queued');
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