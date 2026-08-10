import { __step, createInstance } from '@durable/runtime';
import type { RetryConfig, WorkflowInstance } from '@durable/runtime';

// Retry policy for npm registry network calls: up to 3 retries with exponential
// backoff (250ms, 500ms, 1000ms). Enough to ride out transient network failures
// without stalling a background scan for minutes.
export const NETWORK_RETRY = { retries: 3, baseDelayMs: 250 } as const satisfies RetryConfig;

export type DurableInstance = WorkflowInstance;

// A fresh workflow instance per job run. Every step's cache key is namespaced
// under it, so concurrent scans of different users never collide.
export const createDurableScanInstance = (): DurableInstance => createInstance();

// Reports the active execution path once per app boot. The e2e suite greps
// logcat for the `[durable]` marker to prove scans run through this module.
// The runtime hashes with a registered custom impl, WebCrypto, or its bundled
// pure-JS SHA-256 fallback, so the durable __step path works on every runtime
// (Hermes included) with no setup.
let pathReported = false;
const reportPath = (): void => {
  if (!pathReported) {
    pathReported = true;
    console.log('[durable] durable __step steps active');
  }
};

// Fetches one registry JSON payload as a durable step: retried with
// `NETWORK_RETRY` and keyed on `stepId + args` within `instance`, so identical
// requests short-circuit on re-run while distinct ones stay isolated. `context`
// names the operation for error messages on non-2xx responses.
export const durableFetchJson = async <T>(
  url: string,
  stepId: string,
  args: unknown[],
  instance: DurableInstance,
  context: string,
): Promise<T> => {
  const run = async (): Promise<T> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${context} failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  };
  reportPath();
  return __step(stepId, run, NETWORK_RETRY, args, instance);
};