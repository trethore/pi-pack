import { prompts } from "#src/prompts/generated";
import { encodeJson } from "#src/sandbox/values";
import { MAX_STORE_TOTAL_CHARS, MAX_STORE_VALUE_CHARS } from "#src/sandbox/limits";
import { formatValue } from "#src/sandbox/prelude/errors";

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
    throw new TypeError(`store(${JSON.stringify(key)}) value is not JSON-serializable: ${formatValue(error)}`, {
      cause: error,
    });
  }

  if (json === undefined) {
    throw new TypeError(`store(${JSON.stringify(key)}) value is not JSON-serializable`);
  }

  if (json.length > MAX_STORE_VALUE_CHARS) {
    throw new RangeError(
      prompts.store.valueTooLarge({
        key: JSON.stringify(key),
        size: json.length,
        limit: MAX_STORE_VALUE_CHARS,
        hint: prompts.store.hint,
      }),
    );
  }

  return json;
}

function addEntrySize(size: number, [key, json]: [string, string]): number {
  return size + key.length + json.length;
}

function createWriteEntry([key, json]: [string, string | undefined]): [string] | [string, string] {
  return json === undefined ? [key] : [key, json];
}

export function createStore(snapshot: Record<string, string>) {
  const stored = new Map(Object.entries(snapshot));
  const writes = new Map<string, string | undefined>();
  let storedChars = [...stored].reduce(addEntrySize, 0);

  function store(this: void, key: unknown, value: unknown): void {
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
      throw new RangeError(prompts.store.full({ limit: MAX_STORE_TOTAL_CHARS, hint: prompts.store.hint }));
    }

    stored.set(key, json);
    storedChars = next;
    writes.set(key, json);
  }

  function load(this: void, key: unknown): unknown {
    checkKey("load", key);

    const json = stored.get(key);

    return json === undefined ? undefined : JSON.parse(json);
  }

  function serializeWrites(this: void): string {
    return JSON.stringify([...writes].map(createWriteEntry));
  }

  return { store, load, serializeWrites };
}
