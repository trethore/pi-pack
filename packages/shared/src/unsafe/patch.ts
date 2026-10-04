import { VERSION } from "@earendil-works/pi-coding-agent";

export interface PiPatchMetadata {
  id: string;
  testedPiVersion: string;
}

interface PiPatchDefinition extends PiPatchMetadata {
  apply(this: void): () => void;
}

export interface PiPatch {
  acquire(warn: (message: string) => void): () => void;
}

function validateMetadata(definition: PiPatchMetadata): void {
  if (typeof definition.id !== "string" || definition.id.trim() === "") {
    throw new Error("An unsafe Pi patch must declare an ID.");
  }
  if (
    typeof definition.testedPiVersion !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(definition.testedPiVersion)
  ) {
    throw new Error(`Unsafe Pi patch "${definition.id}" must declare an exact testedPiVersion, not a version range.`);
  }
}

export function createPiPatch(definition: PiPatchDefinition): PiPatch {
  validateMetadata(definition);
  const { id, testedPiVersion, apply } = definition;
  const warnedVersions = new Set<string>();
  let users = 0;
  let restore: (() => void) | undefined;

  return {
    acquire(warn) {
      if (VERSION !== testedPiVersion && !warnedVersions.has(VERSION)) {
        warn(
          `Unsafe Pi patch "${id}" was tested with Pi ${testedPiVersion}, but the running version is ${VERSION}. Applying it anyway; compatibility is unverified.`,
        );
        warnedVersions.add(VERSION);
      }
      if (users === 0) {
        restore = apply();
      }
      users++;
      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        users--;
        if (users === 0) {
          const cleanup = restore;
          restore = undefined;
          cleanup?.();
        }
      };
    },
  };
}
