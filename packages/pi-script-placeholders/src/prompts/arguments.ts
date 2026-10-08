export function parseArguments(source: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: string | undefined;
  for (const character of source) {
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += character;
    }
  }

  if (current) {
    args.push(current);
  }

  return args;
}

function argumentValue(target: string, args: string[]): string {
  return target === "@" || target === "ARGUMENTS" ? args.join(" ") : (args[Number(target) - 1] ?? "");
}

function substitute(token: string, args: string[], expandText: (text: string) => Promise<string>): Promise<string> {
  const fallback = /^\$\{(\d+|ARGUMENTS|@):-([\s\S]*)\}$/.exec(token);
  if (fallback?.[1] !== undefined) {
    const value = argumentValue(fallback[1], args);
    return value ? Promise.resolve(value) : expandText(fallback[2] ?? "");
  }

  const slice = /^\$\{@:(\d+)(?::(\d+))?\}$/.exec(token);
  if (slice?.[1] !== undefined) {
    const start = Math.max(0, Number(slice[1]) - 1);
    const end = slice[2] === undefined ? undefined : start + Number(slice[2]);
    return Promise.resolve(args.slice(start, end).join(" "));
  }
  return Promise.resolve(argumentValue(token.slice(1), args));
}

export async function expandArguments(
  source: string,
  args: string[],
  expandText: (text: string) => Promise<string>,
): Promise<string> {
  // Keep script placeholders inside defaults intact, and never expand supplied argument values.
  const argument =
    /\$\{(?:\d+|ARGUMENTS|@):-(?:\{\{[a-zA-Z0-9_-]+\}\}|[^}])*\}|\$\{@:\d+(?::\d+)?\}|\$(?:ARGUMENTS|@|\d+)/g;
  const parts: Array<Promise<string>> = [];
  let offset = 0;
  for (const match of source.matchAll(argument)) {
    parts.push(expandText(source.slice(offset, match.index)));
    parts.push(substitute(match[0], args, expandText));
    offset = match.index + match[0].length;
  }
  parts.push(expandText(source.slice(offset)));
  return (await Promise.all(parts)).join("");
}
