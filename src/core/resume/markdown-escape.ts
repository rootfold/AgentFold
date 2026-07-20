export function markdownText(input: string): string {
  return input
    .replace(/\r\n?/gu, "\n")
    .replaceAll("\n", " ")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\`*_[\]{}#])/gu, "\\$1");
}

export function markdownCode(input: string): string {
  const printable = input.replaceAll("\r", "\\r").replaceAll("\n", "\\n");
  const longestRun = Math.max(
    0,
    ...[...printable.matchAll(/`+/gu)].map((match) => match[0].length),
  );
  const fence = "`".repeat(longestRun + 1);
  const padding = printable.startsWith("`") || printable.endsWith("`") ? " " : "";
  return `${fence}${padding}${printable}${padding}${fence}`;
}
