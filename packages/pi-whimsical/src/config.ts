import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";

interface WhimsicalConfig {
  enabled: boolean;
  messages: string[];
}

function parseConfig(source: string): WhimsicalConfig {
  const errors: ParseError[] = [];
  const config: unknown = parse(source, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(errors.map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`).join(", "));
  }
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new Error("Expected a configuration object");
  }
  const enabled = "enabled" in config ? config.enabled : true;
  const messages = "messages" in config ? config.messages : [];
  if (typeof enabled !== "boolean") {
    throw new Error("enabled must be a boolean");
  }
  if (!Array.isArray(messages) || !messages.every((message: unknown) => typeof message === "string")) {
    throw new Error("messages must be an array of strings");
  }
  return { enabled, messages };
}

export async function loadConfig(cwd: string, agentDir = getAgentDir()): Promise<WhimsicalConfig> {
  const locations = [join(cwd, ".pi", "pi-whimsical.jsonc"), join(agentDir, "pi-whimsical.jsonc")];
  for (const file of locations) {
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw new Error(`pi-whimsical: could not read ${file}`, { cause: error });
    }
    try {
      return parseConfig(source);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`pi-whimsical: invalid configuration in ${file}: ${reason}`, { cause: error });
    }
  }
  return { enabled: true, messages: [] };
}
