/**
 * A compiled `WebAssembly.Module` of `quickjs-wasi/quickjs.wasm`. Typed opaquely because the Node
 * type definitions do not declare the WebAssembly globals (they live in the DOM lib).
 */
export type CodemodeWasmModule = object;

declare const WebAssembly: {
  Module: new (bytes: Uint8Array) => CodemodeWasmModule;
};

export function isWasmModule(value: unknown): value is CodemodeWasmModule {
  return value instanceof WebAssembly.Module;
}
