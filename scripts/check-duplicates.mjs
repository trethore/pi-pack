import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const configFile = fileURLToPath(new URL("../.jscpd.json", import.meta.url));
const argumentsForJscpd = ["--config", configFile, "--no-tips", "--fail-on-empty", ...process.argv.slice(2)];

let command = process.env.JSCPD_BIN;
let commandArguments = argumentsForJscpd;

if (!command) {
  command = process.execPath;
  try {
    commandArguments = [require.resolve("jscpd/run-jscpd.js"), ...argumentsForJscpd];
  } catch {
    console.error("Could not locate npm jscpd. Run npm ci or enter nix develop.");
    process.exit(1);
  }
}

const result = spawnSync(command, commandArguments, {
  cwd: repositoryRoot,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Could not run jscpd: ${result.error.message}`);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
