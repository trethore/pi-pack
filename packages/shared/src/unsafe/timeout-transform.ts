import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export interface TimeoutTransformInput {
  delay: number;
  getStack(): string;
}

export const SUPPRESS_TIMEOUT = Symbol.for('trethore.shared.timeout-transform.suppress');

export type TimeoutTransformer = (input: TimeoutTransformInput) => number | typeof SUPPRESS_TIMEOUT;

interface TimeoutTransformState {
  original: typeof globalThis.setTimeout;
  wrapper: typeof globalThis.setTimeout;
  transformers: Map<string, TimeoutTransformer>;
}

const PATCH_STATE_KEY = Symbol.for('trethore.shared.timeout-transform.patch-state');

type GlobalWithPatchState = typeof globalThis & {
  [PATCH_STATE_KEY]?: TimeoutTransformState;
};

export function registerTimeoutTransformer(pi: ExtensionAPI, id: string, transform: TimeoutTransformer): void {
  const state = getOrInstallTimeoutTransformState();
  state.transformers.set(id, transform);

  pi.on('session_shutdown', (event) => {
    if (event.reason === 'reload') removeTimeoutTransformer(id);
  });
}

export function removeTimeoutTransformer(id: string): void {
  const global = globalThis as GlobalWithPatchState;
  const state = global[PATCH_STATE_KEY];
  if (!state) return;

  state.transformers.delete(id);
  if (state.transformers.size > 0) return;

  if (globalThis.setTimeout === state.wrapper) globalThis.setTimeout = state.original;
  delete global[PATCH_STATE_KEY];
}

function getOrInstallTimeoutTransformState(): TimeoutTransformState {
  const global = globalThis as GlobalWithPatchState;
  const existing = global[PATCH_STATE_KEY];
  if (existing) return existing;

  const original = globalThis.setTimeout;
  const clear = globalThis.clearTimeout;
  const transformers = new Map<string, TimeoutTransformer>();
  const wrapper = function (this: unknown, callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) {
    let transformedDelay = delay ?? 0;
    if (typeof delay === 'number') {
      let stack: string | undefined;
      const getStack = () => (stack ??= new Error('timeout transform call site').stack ?? '');
      for (const transform of transformers.values()) {
        const result = transform({ delay: transformedDelay, getStack });
        if (result === SUPPRESS_TIMEOUT) return createCancelledTimeout(original, clear, this);
        transformedDelay = result;
      }
    }
    return Reflect.apply(original, this, [callback, transformedDelay, ...args]);
  } as typeof globalThis.setTimeout;
  copyFunctionProperties(original, wrapper);

  const state = { original, wrapper, transformers };
  global[PATCH_STATE_KEY] = state;
  globalThis.setTimeout = wrapper;
  return state;
}

function createCancelledTimeout(
  original: typeof globalThis.setTimeout,
  clear: typeof globalThis.clearTimeout,
  thisArgument: unknown
): ReturnType<typeof globalThis.setTimeout> {
  const timeout = Reflect.apply(original, thisArgument, [() => {}, 0]);
  Reflect.apply(clear, globalThis, [timeout]);
  return timeout;
}

function copyFunctionProperties(source: object, target: object): void {
  for (const key of Reflect.ownKeys(source)) {
    if (Object.hasOwn(target, key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) Object.defineProperty(target, key, descriptor);
  }
}
