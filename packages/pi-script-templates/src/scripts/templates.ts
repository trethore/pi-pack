import type { ScriptTemplatesConfig } from "#src/config";
import { executeScript, type Script } from "#src/scripts/execution";

const placeholder = /\{\{([a-zA-Z0-9_-]+)\}\}/g;

export class ScriptTemplates {
  private readonly results = new Map<string, Promise<string | undefined>>();

  private readonly cwd: string;
  private readonly scripts: Map<string, Script | undefined>;
  private readonly limits: ScriptTemplatesConfig["execution"];
  private readonly warn: (message: string) => void;

  constructor(
    cwd: string,
    scripts: Map<string, Script | undefined>,
    limits: ScriptTemplatesConfig["execution"],
    warn: (message: string) => void,
  ) {
    this.cwd = cwd;
    this.scripts = scripts;
    this.limits = limits;
    this.warn = warn;
  }

  private resolve(name: string): Promise<string | undefined> {
    let result = this.results.get(name);
    if (!result) {
      result = this.compute(name);
      this.results.set(name, result);
    }
    return result;
  }

  private async compute(name: string): Promise<string | undefined> {
    const script = this.scripts.get(name);
    if (!script) {
      if (!this.scripts.has(name)) {
        this.warn(`No script found for "${name}"; placeholder left unchanged.`);
      }
      return undefined;
    }
    const result = await executeScript(script, this.cwd, this.limits);
    if (!result.ok) {
      this.warn(`"${name}" (${script.scope}): ${result.reason}; placeholder left unchanged until /reload.`);
      return undefined;
    }
    return result.output;
  }

  async expand(source: string): Promise<string> {
    const parts: Array<Promise<string>> = [];
    let offset = 0;
    for (const match of source.matchAll(placeholder)) {
      const name = match[1];
      if (name === undefined) {
        continue;
      }
      parts.push(Promise.resolve(source.slice(offset, match.index)));
      parts.push(this.resolve(name).then((output) => output ?? match[0]));
      offset = match.index + match[0].length;
    }
    parts.push(Promise.resolve(source.slice(offset)));
    return (await Promise.all(parts)).join("");
  }
}
