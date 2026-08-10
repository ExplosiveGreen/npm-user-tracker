// Ambient types for the unpublised @durable/runtime package (consumed as a
// `file:` dependency). The runtime ships pure JS without a .d.ts, so the app
// declares the surface it uses. Keep in sync with durable-client's
// packages/runtime/src (see INTEGRATION.md §1.3).
declare module '@durable/runtime' {
  export interface RetryConfig {
    retries?: number;
    maxRetries?: number;
    baseDelayMs?: number;
    baseDelay?: number;
  }

  export interface WorkflowInstance {
    id: string;
    namespace(key: string): string;
  }

  export function createInstance(): WorkflowInstance;

  export function __step<T>(
    stepId: string,
    fn: () => Promise<T>,
    retryConfig?: RetryConfig,
    args?: unknown[],
    instance?: WorkflowInstance,
  ): Promise<T>;

  export function generateStepId(functionName: string, index: number, explicitName?: string): string;

  export function serialize(value: unknown): Promise<unknown>;
  export function deserialize<T = unknown>(value: unknown): T;
  export function toCacheKey(stepId: string, args: unknown[]): Promise<string>;
  export function hash(value: unknown): Promise<string>;
  export function sha256(input: string | ArrayBuffer): Promise<string>;
  export function registerSha256(impl: ((input: string | ArrayBuffer) => string | Promise<string>) | null): void;

  export class Storage {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
  }

  export class InMemoryStore extends Storage {}

  export const stepStore: InMemoryStore;
  export const blobStore: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
  };

  export function clearAll(): void;

  export function workflow(config?: unknown): unknown;
}