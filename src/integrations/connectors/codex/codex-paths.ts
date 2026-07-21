import path from "node:path";

import type { ServicePlatformInput } from "../../service/runtime-directory.js";

export function resolveCodexHomeDirectory(
  platform: ServicePlatformInput,
  override?: string,
): string {
  const platformPath = platform.platform === "win32" ? path.win32 : path.posix;
  const configured = override ?? platform.environment.CODEX_HOME;
  return configured !== undefined && configured.trim().length > 0
    ? platformPath.resolve(configured)
    : platformPath.join(platform.homeDirectory, ".codex");
}

export function resolveCodexConfigPath(platform: ServicePlatformInput, override?: string): string {
  const platformPath = platform.platform === "win32" ? path.win32 : path.posix;
  return platformPath.join(resolveCodexHomeDirectory(platform, override), "config.toml");
}

export function codexCliExecutableCandidates(platform: ServicePlatformInput): readonly string[] {
  const platformPath = platform.platform === "win32" ? path.win32 : path.posix;
  const executableName = platform.platform === "win32" ? "codex.exe" : "codex";
  const pathEntries = (platform.environment.PATH ?? "")
    .split(platform.platform === "win32" ? ";" : ":")
    .filter((entry) => entry.trim().length > 0)
    .map((entry) => platformPath.join(entry, executableName));
  const candidates = [
    ...pathEntries,
    platformPath.join(platform.homeDirectory, ".local", "bin", executableName),
  ];
  if (platform.platform === "win32") {
    const localAppData = platform.environment.LOCALAPPDATA;
    if (localAppData !== undefined && localAppData.trim().length > 0) {
      candidates.push(
        path.win32.join(localAppData, "Programs", "OpenAI", "Codex", "bin", "codex.exe"),
        path.win32.join(localAppData, "Microsoft", "WindowsApps", "codex.exe"),
      );
    }
  } else {
    candidates.push("/usr/local/bin/codex");
    if (platform.platform === "darwin") candidates.push("/opt/homebrew/bin/codex");
  }
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const identity =
      platform.platform === "win32" ? candidate.toLocaleLowerCase("en-US") : candidate;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function codexAppEvidencePaths(platform: ServicePlatformInput): readonly string[] {
  if (platform.platform === "darwin") {
    return [
      "/Applications/Codex.app",
      path.posix.join(platform.homeDirectory, "Applications", "Codex.app"),
    ];
  }
  if (platform.platform === "win32") {
    const localAppData = platform.environment.LOCALAPPDATA;
    return localAppData === undefined
      ? []
      : [path.win32.join(localAppData, "Programs", "OpenAI", "Codex")];
  }
  return [];
}

export function codexIdeExtensionDirectories(platform: ServicePlatformInput): readonly string[] {
  const platformPath = platform.platform === "win32" ? path.win32 : path.posix;
  return [
    platformPath.join(platform.homeDirectory, ".vscode", "extensions"),
    platformPath.join(platform.homeDirectory, ".vscode-insiders", "extensions"),
  ];
}
