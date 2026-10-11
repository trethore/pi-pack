const WASI_IOVEC_SIZE_BYTES = 8;
const WASI_IOVEC_LENGTH_OFFSET_BYTES = 4;
const WASI_LITTLE_ENDIAN = true;
const WASI_SUCCESS = 0;

/**
 * QuickJS writes engine diagnostics to fd 1 and 2, which the default shim
 * forwards to the host's stdout and stderr. That output belongs to the host
 * application (for example a TUI), so it is discarded. Reporting every byte as
 * written keeps libc from retrying.
 */
export function discardOutput(memory: { readonly buffer: ArrayBufferLike }) {
  return {
    fd_write(_fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number): number {
      const view = new DataView(memory.buffer);
      let written = 0;

      for (let index = 0; index < iovsLen; index++) {
        const lengthOffset = iovsPtr + index * WASI_IOVEC_SIZE_BYTES + WASI_IOVEC_LENGTH_OFFSET_BYTES;
        written += view.getUint32(lengthOffset, WASI_LITTLE_ENDIAN);
      }

      view.setUint32(nwrittenPtr, written, WASI_LITTLE_ENDIAN);

      return WASI_SUCCESS;
    },
  };
}
