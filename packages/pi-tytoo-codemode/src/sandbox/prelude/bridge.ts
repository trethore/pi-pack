export type HostBridge = (
  ...args:
    | [kind: "call" | "global", id: number, name: string, args: string | undefined]
    | [kind: "output", type: "text" | "console" | "image", data: string, mimeType?: string | undefined]
    | [kind: "done", ok: boolean, payload: string | undefined, writes?: string | undefined]
) => void;

export type ScriptFunction = (...args: unknown[]) => Promise<unknown>;

export function createBridge(bridge: HostBridge) {
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: unknown): void }>();
  let nextId = 1;
  return {
    hasPending: () => pending.size > 0,
    caller(kind: "call" | "global", name: string, spread = false): ScriptFunction {
      return (...args) =>
        new Promise((resolve, reject) => {
          let json: string | undefined;
          try {
            const value = spread ? args : args[0];
            json = value === undefined ? undefined : JSON.stringify(value);
          } catch (error) {
            reject(error);
            return;
          }
          const id = nextId++;
          pending.set(id, { resolve, reject });
          bridge(kind, id, name, json);
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
