import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("test setup", () => {
  it.each(["HOME", "USERPROFILE"])("sets %s to an isolated home directory", (variableName) => {
    // Arrange
    const homeDirectory = process.env[variableName] ?? "";

    // Act
    const homeExists = existsSync(homeDirectory);
    const homeParent = path.dirname(homeDirectory);
    const homeName = path.basename(homeDirectory);

    // Assert
    expect(homeDirectory).toBe(process.env.HOME);
    expect(homeParent).toBe(tmpdir());
    expect(homeName).toMatch(/^pi-pack-test-home-/);
    expect(homeExists).toBe(true);
  });
});
