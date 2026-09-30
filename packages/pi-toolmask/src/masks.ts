import type { ToolmaskConfig } from "./config.ts";

interface Rule {
  pattern: RegExp;
  keep: boolean;
}

export class ToolMasks {
  private readonly rules: Rule[];

  constructor(config: ToolmaskConfig) {
    this.rules = config.enabled
      ? config.masks.map((mask) => {
          const keep = mask.startsWith("!");
          const pattern = keep ? mask.slice(1) : mask;
          const expression = Array.from(pattern, (character) => {
            if (character === "*") return ".*";
            if (character === "?") return ".";
            return character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
          }).join("");
          return { keep, pattern: new RegExp(`^${expression}$`) };
        })
      : [];
  }

  isMasked(name: string): boolean {
    let masked = false;
    for (const rule of this.rules) {
      if (rule.pattern.test(name)) {
        masked = !rule.keep;
      }
    }
    return masked;
  }
}
