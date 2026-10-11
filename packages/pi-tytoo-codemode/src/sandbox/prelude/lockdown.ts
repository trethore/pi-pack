// oxlint-disable typescript/unbound-method -- Traversal inspects function identities; it never calls them.
/// <reference lib="esnext.iterator" />

const OVERRIDABLE_PROPERTIES = new Set<PropertyKey>([
  "constructor",
  "name",
  "message",
  "toString",
  "toLocaleString",
  "valueOf",
  "toJSON",
]);

function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

// Accessors preserve assignment to instances of frozen prototypes (the override mistake).
function allowOverride(object: object, key: PropertyKey, value: unknown, enumerable: boolean) {
  const accessor = Object.getOwnPropertyDescriptor(
    {
      get accessor(): unknown {
        return value;
      },
      set accessor(next: unknown) {
        if (this === object) {
          throw new TypeError(`Cannot assign to read only property '${String(key)}' of a built-in`);
        }

        if (!isObjectLike(this)) {
          return;
        }

        Object.defineProperty(this, key, { value: next, writable: true, enumerable: true, configurable: true });
      },
    },
    "accessor",
  );

  if (!accessor) {
    throw new Error("Missing override accessor");
  }

  Object.defineProperty(object, key, { ...accessor, enumerable, configurable: false });

  return accessor;
}

function addIntrinsics(enqueueObject: (value: unknown) => void): void {
  enqueueObject(Object.getPrototypeOf(function* () {}));
  enqueueObject(Object.getPrototypeOf(async function () {}));
  enqueueObject(Object.getPrototypeOf(async function* () {}));
  enqueueObject(Object.getPrototypeOf(Int8Array));
  enqueueObject(Object.getPrototypeOf([][Symbol.iterator]()));
  enqueueObject(Object.getPrototypeOf(new Map()[Symbol.iterator]()));
  enqueueObject(Object.getPrototypeOf(new Set()[Symbol.iterator]()));
  enqueueObject(Object.getPrototypeOf(""[Symbol.iterator]()));
  enqueueObject(Object.getPrototypeOf(/a/[Symbol.matchAll]("")));

  if (typeof Iterator === "function") {
    if (typeof Iterator.prototype.map === "function") {
      enqueueObject(Object.getPrototypeOf([].values().map((x) => x)));
    }

    if (typeof Iterator.from === "function") {
      enqueueObject(Object.getPrototypeOf(Iterator.from({ next: () => ({ done: true, value: undefined }) })));
    }
  }
}

export function lockdown(): void {
  const seen = new Set<object>([globalThis]);
  const pendingObjects: object[] = [];

  function enqueueObject(value: unknown): void {
    if (!isObjectLike(value)) {
      return;
    }

    if (seen.has(value)) {
      return;
    }

    seen.add(value);
    pendingObjects.push(value);
  }

  function visitProperty(object: object, key: PropertyKey, descriptor: PropertyDescriptor): void {
    if (!("value" in descriptor)) {
      enqueueObject(descriptor.get);
      enqueueObject(descriptor.set);
      return;
    }

    enqueueObject(descriptor.value);

    if (
      descriptor.writable &&
      descriptor.configurable &&
      (object === Object.prototype || OVERRIDABLE_PROPERTIES.has(key))
    ) {
      const accessor = allowOverride(object, key, descriptor.value, descriptor.enumerable === true);
      enqueueObject(accessor.get);
      enqueueObject(accessor.set);
    }
  }

  function lockGlobalProperties(): void {
    for (const key of Reflect.ownKeys(globalThis)) {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
      if (!descriptor) {
        continue;
      }

      enqueueObject(descriptor.value);
      enqueueObject(descriptor.get);
      enqueueObject(descriptor.set);

      if ("value" in descriptor && descriptor.configurable) {
        Object.defineProperty(globalThis, key, { writable: false, configurable: false });
      }
    }
  }

  function freezeObject(object: object): void {
    enqueueObject(Object.getPrototypeOf(object));

    for (const key of Reflect.ownKeys(object)) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (descriptor) {
        visitProperty(object, key, descriptor);
      }
    }

    Object.freeze(object);
  }

  lockGlobalProperties();
  addIntrinsics(enqueueObject);

  for (let object = pendingObjects.pop(); object !== undefined; object = pendingObjects.pop()) {
    freezeObject(object);
  }
}
