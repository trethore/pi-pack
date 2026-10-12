/**
 * A candidate convenience alias for a tool: characters that are not valid in a JavaScript
 * identifier become `_`. `mcp__docs__search` stays as is, `my-tool` becomes `my_tool`.
 */
export function toCodemodeIdentifier(name: string): string {
  let identifier = "";
  for (const char of name) {
    const valid = identifier === "" ? /^[A-Za-z_$]$/.test(char) : /^[A-Za-z0-9_$]$/.test(char);
    identifier += valid ? char : "_";
  }
  return identifier === "" ? "_" : identifier;
}

export function renderPropertyName(name: string): string {
  return name === toCodemodeIdentifier(name) ? name : JSON.stringify(name);
}

export function renderMemberAccess(object: string, name: string): string {
  return name === toCodemodeIdentifier(name) ? `${object}.${name}` : `${object}[${JSON.stringify(name)}]`;
}

export function createToolAliases(names: readonly string[]) {
  const canonical = new Set(names);
  const candidates = new Map<string, string[]>();

  for (const name of names) {
    const alias = toCodemodeIdentifier(name);
    if (canonical.has(alias)) {
      continue;
    }
    const matches = candidates.get(alias) ?? [];
    matches.push(name);
    candidates.set(alias, matches);
  }

  const aliases = new Map<string, string>();
  const ambiguousAliases = new Map<string, readonly string[]>();
  for (const [alias, matches] of candidates) {
    const name = matches[0];
    if (matches.length === 1 && name !== undefined) {
      aliases.set(alias, name);
    } else {
      ambiguousAliases.set(alias, matches);
    }
  }

  return { aliases, ambiguousAliases };
}
