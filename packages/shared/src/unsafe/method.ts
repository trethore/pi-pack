import { createPiPatch, type PiPatch, type PiPatchMetadata } from "#unsafe/patch";

type MethodKeys<T> = {
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];

interface MethodPatchDefinition<T extends object, K extends MethodKeys<T>> extends PiPatchMetadata {
  target: T;
  key: K;
  wrap(this: void, original: T[K]): T[K];
}

interface MethodLayer {
  active: boolean;
  original: PropertyDescriptor;
}

const layers = new WeakMap<object, MethodLayer>();

function restorableDescriptor(descriptor: PropertyDescriptor): PropertyDescriptor {
  while (true) {
    const value: unknown = descriptor.value;
    const layer = typeof value === "function" ? layers.get(value) : undefined;
    if (!layer || layer.active) {
      return descriptor;
    }
    descriptor = layer.original;
  }
}

export function createPiMethodPatch<T extends object, K extends MethodKeys<T>>(
  definition: MethodPatchDefinition<T, K>,
): PiPatch {
  const { target, key, wrap, id } = definition;
  return createPiPatch({
    id,
    testedPiVersion: definition.testedPiVersion,
    apply() {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (!descriptor || typeof descriptor.value !== "function") {
        throw new Error(`Unsafe Pi patch "${id}": ${String(key)} must be an own data method.`);
      }
      const original = target[key];
      if (typeof original !== "function") {
        throw new Error(`Unsafe Pi patch "${id}": ${String(key)} is no longer a method.`);
      }
      const replacement = wrap(original);
      if (typeof replacement !== "function") {
        throw new Error(`Unsafe Pi patch "${id}": the replacement must be a method.`);
      }
      const layer: MethodLayer = { active: true, original: descriptor };
      // Later wrappers may retain this method after release. Disable its behavior
      // without removing their patches, then collapse inactive layers when possible.
      const installed = new Proxy(original, {
        apply(method, receiver, args) {
          return Reflect.apply(layer.active ? replacement : method, receiver, args);
        },
      });
      Object.defineProperty(target, key, { ...descriptor, value: installed });
      layers.set(installed, layer);
      return () => {
        layer.active = false;
        if (Object.getOwnPropertyDescriptor(target, key)?.value === installed) {
          Object.defineProperty(target, key, restorableDescriptor(descriptor));
        }
      };
    },
  });
}
