export function dedent(str: string): string {
  const lines = str.replace(/^\n|\n\s*$/g, "").split("\n");
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)?.[0].length ?? 0);
  if (indents.length === 0) {
    return "";
  }

  const minIndent = Math.min(...indents);

  return lines.map((line) => line.slice(minIndent)).join("\n");
}
