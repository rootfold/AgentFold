const windowsDrivePrefix = /^[a-z]:/iu;

export function normalizeGitPath(input: string): string {
  if (
    input.length === 0 ||
    input.includes("\0") ||
    input.startsWith("/") ||
    input.startsWith("\\") ||
    windowsDrivePrefix.test(input)
  ) {
    throw new Error("Git returned a path outside the repository");
  }

  const portable = input.replaceAll("\\", "/");
  const segments = portable.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "..")) {
    throw new Error("Git returned an unsafe repository path");
  }

  const normalized = segments.filter((segment) => segment !== ".").join("/");
  if (normalized.length === 0) {
    throw new Error("Git returned an unsafe repository path");
  }
  return normalized;
}

export function comparePortablePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
