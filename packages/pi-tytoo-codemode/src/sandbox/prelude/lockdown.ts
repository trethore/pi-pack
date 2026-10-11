// oxlint-disable typescript/unbound-method -- Traversal inspects function identities; it never calls them.
/// <reference lib="esnext.iterator" />

const OVERRIDABLE = new Set<PropertyKey>([
  "constructor",
  "name",
  "message",
  "toString",
  "toLocaleString",
  "valueOf",
  "toJSON",
]);

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
        if ((typeof this !== "object" || this === null) && typeof this !== "function") {
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

function addIntrinsics(add: (value: unknown) => void): void {
  add(Object.getPrototypeOf(function* () {}));
  add(Object.getPrototypeOf(async function () {}));
  add(Object.getPrototypeOf(async function* () {}));
  add(Object.getPrototypeOf(Int8Array));
  add(Object.getPrototypeOf([][Symbol.iterator]()));
  add(Object.getPrototypeOf(new Map()[Symbol.iterator]()));
  add(Object.getPrototypeOf(new Set()[Symbol.iterator]()));
  add(Object.getPrototypeOf(""[Symbol.iterator]()));
  add(Object.getPrototypeOf(/a/[Symbol.matchAll]("")));
  if (typeof Iterator === "function") {
    if (typeof Iterator.prototype.map === "function") {
      add(Object.getPrototypeOf([].values().map((x) => x)));
    }
    if (typeof Iterator.from === "function") {
      add(Object.getPrototypeOf(Iterator.from({ next: () => ({ done: true, value: undefined }) })));
    }
  }
}

export function lockdown(): void {
  const seen = new Set<object>([globalThis]);
  const queue: object[] = [];
  function add(value: unknown): void {
    if ((typeof value !== "object" || value === null) && typeof value !== "function") {
      return;
    }
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    queue.push(value);
  }
  function visit(object: object, key: PropertyKey, descriptor: PropertyDescriptor): void {
    if (!("value" in descriptor)) {
      add(descriptor.get);
      add(descriptor.set);
      return;
    }
    add(descriptor.value);
    if (descriptor.writable && descriptor.configurable && (object === Object.prototype || OVERRIDABLE.has(key))) {
      const accessor = allowOverride(object, key, descriptor.value, descriptor.enumerable === true);
      add(accessor.get);
      add(accessor.set);
    }
  }
  for (const key of Reflect.ownKeys(globalThis)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    if (!descriptor) {
      continue;
    }
    add(descriptor.value);
    add(descriptor.get);
    add(descriptor.set);
    if ("value" in descriptor && descriptor.configurable) {
      Object.defineProperty(globalThis, key, { writable: false, configurable: false });
    }
  }
  addIntrinsics(add);
  for (let object = queue.pop(); object !== undefined; object = queue.pop()) {
    add(Object.getPrototypeOf(object));
    for (const key of Reflect.ownKeys(object)) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (descriptor) {
        visit(object, key, descriptor);
      }
    }
    Object.freeze(object);
  }
}
