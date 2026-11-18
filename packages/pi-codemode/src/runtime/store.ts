import { type CodemodeStoreWrites } from "@earendil-works/pi-codemode";
import { type SessionEntry } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Check as check } from "typebox/value";

const CUSTOM_ENTRY_TYPE = "custom";
const EMPTY = 0;
const { Object: object, Record: record, String: string, Unknown: unknown, Array: array } = Type;
const writesSchema = object({
	set: record(string(), unknown()),
	delete: array(string()),
});

function storeWrites(entry: SessionEntry): CodemodeStoreWrites | undefined {
	const isStoreEntry = entry.type === CUSTOM_ENTRY_TYPE && entry.customType === Store.entryType;
	if (isStoreEntry) {
		const { data } = entry;
		if (check(writesSchema, data)) {
			return data;
		}
	}
	return undefined;
}

// Share Pi's entry format so switching implementations preserves existing branches.
export const Store = {
	entryType: "codemode-store",
	read(branch: readonly SessionEntry[]): Record<string, unknown> {
		const values = new Map<string, unknown>();
		for (const entry of branch) {
			const writes = storeWrites(entry);
			if (writes !== undefined) {
				for (const key of writes.delete) {
					values.delete(key);
				}
				for (const [key, value] of Object.entries(writes.set)) {
					values.set(key, value);
				}
			}
		}
		return Object.fromEntries(values);
	},
	changed(writes: CodemodeStoreWrites): boolean {
		return writes.delete.length > EMPTY || Object.keys(writes.set).length > EMPTY;
	},
};
