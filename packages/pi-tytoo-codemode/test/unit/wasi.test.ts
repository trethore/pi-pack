import { describe, expect, it } from "vitest";
import { discardOutput } from "#src/sandbox/wasi";

describe("discarded WASI output", () => {
  it.each([1, 2])("reports all bytes written to fd %s without changing the vectors", (fd) => {
    // Arrange
    const buffer = new ArrayBuffer(80);
    const view = new DataView(buffer);
    view.setUint32(16, 64, true);
    view.setUint32(20, 3, true);
    view.setUint32(24, 68, true);
    view.setUint32(28, 258, true);
    view.setUint32(32, 72, true);
    view.setUint32(36, 0, true);
    const expected = new Uint8Array(buffer).slice();
    expected.set([5, 1, 0, 0], 4);
    const wasi = discardOutput({ buffer });

    // Act
    const error = wasi.fd_write(fd, 16, 3, 4);

    // Assert
    expect(error).toBe(0);
    expect(new Uint8Array(buffer)).toEqual(expected);
  });

  it("reports zero bytes for an empty vector list", () => {
    // Arrange
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(0, 42, true);
    const wasi = discardOutput({ buffer });

    // Act
    const error = wasi.fd_write(1, buffer.byteLength, 0, 0);

    // Assert
    expect(error).toBe(0);
    expect(view.getUint32(0, true)).toBe(0);
  });

  it("uses the current memory buffer on each write", () => {
    // Arrange
    const memory = { buffer: new ArrayBuffer(32) };
    const previous = new DataView(memory.buffer);
    previous.setUint32(4, 7, true);
    const wasi = discardOutput(memory);
    wasi.fd_write(1, 0, 1, 16);

    memory.buffer = new ArrayBuffer(32);
    const current = new DataView(memory.buffer);
    current.setUint32(4, 11, true);

    // Act
    const error = wasi.fd_write(1, 0, 1, 16);

    // Assert
    expect(error).toBe(0);
    expect(previous.getUint32(16, true)).toBe(7);
    expect(current.getUint32(16, true)).toBe(11);
  });
});
