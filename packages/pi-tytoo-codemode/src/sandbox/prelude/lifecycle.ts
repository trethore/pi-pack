import { BridgeMessageType, type HostBridge } from "#src/sandbox/bridge-protocol";
import { describeError } from "#src/sandbox/prelude/errors";

export function createLifecycle(bridge: HostBridge, serializeWrites: () => string) {
  let finished = false;
  const exitSignal = Object.freeze({});

  function done(ok: boolean, payload: string | undefined, writes?: string): void {
    if (finished) {
      return;
    }

    finished = true;
    bridge(BridgeMessageType.Done, ok, payload, writes);
  }

  function fail(error: unknown): void {
    done(false, describeError(error));
  }

  function complete(value: unknown): void {
    try {
      done(true, value === undefined ? undefined : JSON.stringify(value), serializeWrites());
    } catch (error) {
      fail(error);
    }
  }

  function isFinished(): boolean {
    return finished;
  }

  function exit(this: void): never {
    try {
      done(true, undefined, serializeWrites());
    } catch (error) {
      fail(error);
    }

    throw exitSignal;
  }

  function run(fn: () => Promise<unknown>): void {
    let promise: Promise<unknown>;
    try {
      promise = fn();
    } catch (error) {
      fail(error);
      return;
    }

    void Promise.prototype.then.call(promise, complete, fail);
  }

  function stalled(hasPending: boolean): boolean {
    if (finished || hasPending) {
      return false;
    }

    fail(
      new Error(
        "The script is waiting on a promise that can never settle: no tool call is pending, and timers do not exist here.",
      ),
    );

    return true;
  }

  return { done, isFinished, exit, run, stalled };
}
