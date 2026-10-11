import type { BridgeCallType, HostBridge } from "#src/sandbox/bridge-protocol";

export type ScriptFunction = (...args: unknown[]) => Promise<unknown>;

export function createBridge(bridge: HostBridge) {
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: unknown): void }>();
  let nextId = 1;

  return {
    hasPending: () => pending.size > 0,

    caller(kind: BridgeCallType, name: string, spread = false): ScriptFunction {
      return (...args) =>
        new Promise((resolve, reject) => {
          const value = spread ? args : args[0];
          const json = value === undefined ? undefined : JSON.stringify(value);

          const id = nextId++;
          pending.set(id, { resolve, reject });

          try {
            bridge(kind, id, name, json);
          } catch (error) {
            pending.delete(id);
            reject(error);
          }
        });
    },

    settle(this: void, id: number, ok: boolean, payload: string | undefined): void {
      const entry = pending.get(id);
      if (!entry) {
        return;
      }

      pending.delete(id);

      if (!ok) {
        entry.reject(new Error(payload));
        return;
      }

      try {
        const value: unknown = payload === undefined ? undefined : JSON.parse(payload);
        entry.resolve(value);
      } catch (error) {
        entry.reject(error);
      }
    },
  };
}
