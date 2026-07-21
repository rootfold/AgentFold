import path from "node:path";

import type { FileSystem } from "./filesystem.js";

const darwinSystemAliases = new Map<string, string>([
  ["/etc", "/private/etc"],
  ["/tmp", "/private/tmp"],
  ["/var", "/private/var"],
]);

function platformPath(platform: NodeJS.Platform): typeof path.win32 | typeof path.posix {
  return platform === "win32" ? path.win32 : path.posix;
}

function normalizedPath(value: string, platform: NodeJS.Platform): string {
  const implementation = platformPath(platform);
  const normalized = implementation.resolve(value);
  const withoutTrailingSeparators =
    normalized === implementation.parse(normalized).root
      ? normalized
      : normalized.replace(/[\\/]+$/u, "");
  return platform === "win32"
    ? withoutTrailingSeparators.toLocaleLowerCase("en-US")
    : withoutTrailingSeparators;
}

export function normalizeKnownPlatformPathAliases(
  value: string,
  platform: NodeJS.Platform,
): string {
  const normalized = normalizedPath(value, platform);
  if (platform !== "darwin") return normalized;

  for (const [alias, canonical] of darwinSystemAliases) {
    const relative = path.posix.relative(alias, normalized);
    if (
      relative === "" ||
      (relative !== ".." && !relative.startsWith("../") && !path.posix.isAbsolute(relative))
    ) {
      return normalizedPath(path.posix.resolve(canonical, relative), platform);
    }
  }
  return normalized;
}

export function samePlatformPath(left: string, right: string, platform: NodeJS.Platform): boolean {
  return (
    normalizeKnownPlatformPathAliases(left, platform) ===
    normalizeKnownPlatformPathAliases(right, platform)
  );
}

export async function isKnownPlatformPathAlias(
  fileSystem: FileSystem,
  candidate: string,
  platform: NodeJS.Platform,
): Promise<boolean> {
  if (platform !== "darwin") return false;
  const normalizedCandidate = normalizedPath(candidate, platform);
  const expected = darwinSystemAliases.get(normalizedCandidate);
  if (expected === undefined) return false;

  return normalizedPath(await fileSystem.realPath(candidate), platform) === expected;
}
