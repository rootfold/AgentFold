export type RepositoryPathNormalizationResult =
  | { readonly success: true; readonly path: string }
  | { readonly success: false; readonly message: string };

const windowsDrivePrefix = /^[a-z]:/iu;

export function normalizeRepositoryPath(input: string): RepositoryPathNormalizationResult {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { success: false, message: "Must not be empty" };
  }

  if (
    trimmed.includes("\0") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    windowsDrivePrefix.test(trimmed)
  ) {
    return {
      success: false,
      message: "Must be a repository-relative path, not an absolute path",
    };
  }

  const segments = trimmed.replaceAll("\\", "/").split("/");

  if (segments.includes("..")) {
    return {
      success: false,
      message: "Parent traversal is not allowed in repository paths",
    };
  }

  const normalized = segments.filter((segment) => segment.length > 0 && segment !== ".").join("/");

  if (normalized.length === 0) {
    return { success: false, message: "Must identify a path inside the repository" };
  }

  return { success: true, path: normalized };
}

export function normalizeRepositoryPaths(paths: readonly string[]): readonly string[] {
  const normalized = paths.map((configuredPath) => {
    const result = normalizeRepositoryPath(configuredPath);

    if (!result.success) {
      throw new Error(result.message);
    }

    return result.path;
  });

  return [...new Set(normalized)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
