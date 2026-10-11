import { encodeJson } from "#src/sandbox/values";
import { MAX_STORE_TOTAL_CHARS, MAX_STORE_VALUE_CHARS } from "#src/sandbox/limits";
import { format } from "#src/sandbox/prelude/errors";

const STORE_HINT =
  "store() is for small state such as IDs or summaries. Show images with image(), keep large data in variables, or write it to a file with a tool.";
function checkKey(name: string, key: unknown): asserts key is string {
  if (typeof key !== "string") {
    throw new TypeError(`${name}() key must be a string`);
  }
}

function serializeValue(key: string, value: unknown): string {
  let json: string | undefined;
  try {
    json = encodeJson(value);
  } catch (error) {
    throw new TypeError(`store(${JSON.stringify(key)}) value is not JSON-serializable: ${format(error)}`, {
      cause: error,
    });
  }
  if (json === undefined) {
    throw new TypeError(`store(${JSON.stringify(key)}) value is not JSON-serializable`);
  }
  if (json.length > MAX_STORE_VALUE_CHARS) {
    throw new RangeError(
      `store(${JSON.stringify(key)}) value has ${json.length} characters of JSON, more than the limit of ${MAX_STORE_VALUE_CHARS}. ${STORE_HINT}`,
    );
  }
  return json;
}

export function createStore(snapshot: Record<string, string>) {
  const stored = new Map(Object.entries(snapshot));
  const writes = new Map<string, string | undefined>();
  let storedChars = [...stored].reduce((size, [key, value]) => size + key.length + value.length, 0);
  return {
    store(this: void, key: unknown, value: unknown): void {
      checkKey("store", key);
      const previous = stored.get(key);
      const previousSize = previous === undefined ? 0 : key.length + previous.length;
      if (value === undefined) {
        stored.delete(key);
        storedChars -= previousSize;
        writes.set(key, undefined);
        return;
      }
      const json = serializeValue(key, value);
      const next = storedChars - previousSize + key.length + json.length;
      if (next > MAX_STORE_TOTAL_CHARS) {
        throw new RangeError(
          `store is full: stored values would exceed ${MAX_STORE_TOTAL_CHARS} characters of JSON. Delete keys with store(key, undefined). ${STORE_HINT}`,
        );
      }
      stored.set(key, json);
      storedChars = next;
      writes.set(key, json);
    },
    load(this: void, key: unknown): unknown {
      checkKey("load", key);
      const json = stored.get(key);
      return json === undefined ? undefined : JSON.parse(json);
    },
    serializeWrites(this: void): string {
      return JSON.stringify([...writes].map(([key, json]) => (json === undefined ? [key] : [key, json])));
    },
  };
}
