import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readOptionalFile } from "@pi-pack/shared/files";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

beforeEach(() => {
  vi.mocked(readFile).mockReset();
});

describe("readOptionalFile", () => {
  it.each(["", '{ // keep comments\n "enabled": true, }'])(
    "reads UTF-8 content without modifying %j",
    async (source) => {
      // Arrange
      vi.mocked(readFile).mockResolvedValueOnce(source);

      // Act
      const result = await readOptionalFile("config.jsonc");

      // Assert
      expect(result).toBe(source);
      expect(readFile).toHaveBeenCalledExactlyOnceWith("config.jsonc", "utf8");
    },
  );

  it("returns undefined for missing files", async () => {
    // Arrange
    const error = Object.assign(new Error("missing file"), { code: "ENOENT" });
    vi.mocked(readFile).mockRejectedValueOnce(error);

    // Act
    const result = await readOptionalFile("missing.jsonc");

    // Assert
    expect(result).toBeUndefined();
  });

  it.each(["EACCES", "EISDIR", "ENOTDIR"])("preserves %s errors", async (code) => {
    // Arrange
    const error = Object.assign(new Error("read failed"), { code });
    vi.mocked(readFile).mockRejectedValueOnce(error);

    // Act
    const result = readOptionalFile("config.jsonc");

    // Assert
    await expect(result).rejects.toBe(error);
  });

  it.each([new Error("read failed"), "ENOENT", null])("preserves failures without an error code: %j", async (error) => {
    // Arrange
    vi.mocked(readFile).mockRejectedValueOnce(error);

    // Act
    const result = readOptionalFile("config.jsonc");

    // Assert
    await expect(result).rejects.toBe(error);
  });
});
