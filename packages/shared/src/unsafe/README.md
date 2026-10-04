# Unsafe Pi patches

Import patch utilities from `@pi-pack/shared/unsafe`. Every definition must declare an ID and one exact `testedPiVersion`; version ranges are rejected.

The running version comes from Pi's exported `VERSION`. A mismatch warns once per definition and running version, before applying the patch. It does not block application. A matching version is not proof of compatibility with modified Pi builds or other extensions.

## Method patches

`createPiMethodPatch` wraps an existing own data method. For example:

```ts
import { createPiMethodPatch } from "@pi-pack/shared/unsafe";

const target = {
  format(value: string) {
    return value;
  },
};

const patch = createPiMethodPatch({
  id: "my-extension/format",
  testedPiVersion: "1.0.0",
  target,
  key: "format",
  wrap(original) {
    return function (this: typeof target, value: string) {
      return original.call(this, value).trim();
    };
  },
});
```

Define a patch once and acquire it for each operation that needs it:

```ts
const release = patch.acquire((message) => ctx.ui.notify(message, "warning"));
try {
  await operation();
} finally {
  release();
}
```

- Installation is lazy. Overlapping acquisitions of the same definition share one installation.
- Release is idempotent. The last release restores the original property descriptor if the patch still owns the method.
- A later patch is not overwritten. Retained wrappers become pass-through functions after release. Layers created by these utilities can be released in either order.
- Accessors, inherited methods, and nonfunction targets are rejected. Immutable targets fail without being modified. Method arguments and receivers are preserved; signatures and behavior are not validated.
- The wrapper factory must not mutate the target itself.

These utilities operate on reachable object methods. They do not rewrite installed files or make private module functions or immutable ES module exports patchable.

## Other patches

`createPiPatch({ id, testedPiVersion, apply })` provides the same version warning and acquisition lifecycle for other runtime changes. `apply` must return a synchronous cleanup function. If it throws after a partial mutation, it is responsible for rolling that mutation back. Application and cleanup errors propagate to the caller.

Keep patch-specific checks and request scoping in the owning extension. Retest before changing `testedPiVersion`; do not update it only to silence a warning.
