import { isRecord } from "#src/sandbox/values";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { CODEMODE_STORE_ENTRY_TYPE } from "#src/constants";
import { type CodemodeStoreEntryData } from "#src/types";
function isStoreEntryData(data: unknown): data is CodemodeStoreEntryData {
  if (!isRecord(data)) {
    return false;
  }
  const { set, delete: deleted } = data;
  return isRecord(set) && Array.isArray(deleted) && deleted.every((key: unknown) => typeof key === "string");
}

/** Values of `load()`: the `codemode-store` entries on the branch, applied from the root. */
export function readCodemodeStore(branch: readonly SessionEntry[]): Record<string, unknown> {
  const store = new Map<string, unknown>();
  for (const entry of branch) {
    if (entry.type !== "custom" || entry.customType !== CODEMODE_STORE_ENTRY_TYPE || !isStoreEntryData(entry.data)) {
      continue;
    }
    for (const key of entry.data.delete) {
      store.delete(key);
    }
    for (const [key, value] of Object.entries(entry.data.set)) {
      store.set(key, value);
    }
  }
  return Object.fromEntries(store);
}
