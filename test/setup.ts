import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const originalEnvironment = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
};
const testHome = mkdtempSync(path.join(tmpdir(), "pi-pack-test-home-"));

process.env.HOME = testHome;
process.env.USERPROFILE = testHome;

afterAll(() => {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  rmSync(testHome, { recursive: true, force: true });
});
