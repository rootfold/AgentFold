import path from "node:path";

import type { AntigravityConcreteConnectorSurface } from "../connector-types.js";
import type { ServicePlatformInput } from "../../service/runtime-directory.js";

export interface AntigravityConfigCandidateDefinition {
  readonly id: "central" | "cli-transition" | "workspace";
  readonly scope: "global" | "workspace";
  readonly surfaces: readonly AntigravityConcreteConnectorSurface[];
  readonly path: string;
  readonly rank: number;
  readonly documentationUrl: string;
}

export const antigravityDocumentation = {
  mcp: "https://antigravity.google/docs/mcp",
  rules: "https://antigravity.google/docs/ide-rules",
  cliMigration: "https://antigravity.google/docs/gcli-migration",
  ideCodelab: "https://codelabs.developers.google.com/getting-started-agy-ide",
  cliCodelab: "https://codelabs.developers.google.com/genai-for-dev-antigravity-cli",
} as const;

export function antigravityConfigCandidateDefinitions(
  platform: ServicePlatformInput,
  repositoryRoot: string,
): readonly AntigravityConfigCandidateDefinition[] {
  const platformPath = platform.platform === "win32" ? path.win32 : path.posix;
  return [
    {
      id: "central",
      scope: "global",
      surfaces: ["desktop", "ide", "cli"],
      path: platformPath.join(platform.homeDirectory, ".gemini", "config", "mcp_config.json"),
      rank: 1,
      documentationUrl: antigravityDocumentation.mcp,
    },
    {
      id: "cli-transition",
      scope: "global",
      surfaces: ["cli"],
      path: platformPath.join(
        platform.homeDirectory,
        ".gemini",
        "antigravity-cli",
        "mcp_config.json",
      ),
      rank: 2,
      documentationUrl: antigravityDocumentation.cliMigration,
    },
    {
      id: "workspace",
      scope: "workspace",
      surfaces: ["ide", "cli"],
      path: platformPath.join(repositoryRoot, ".agents", "mcp_config.json"),
      rank: 3,
      documentationUrl: antigravityDocumentation.mcp,
    },
  ];
}

export interface AntigravityExecutableCandidate {
  readonly surface: AntigravityConcreteConnectorSurface;
  readonly path: string;
}

export function antigravityExecutableCandidates(
  platform: ServicePlatformInput,
): readonly AntigravityExecutableCandidate[] {
  if (platform.platform === "win32") {
    const localAppData = platform.environment.LOCALAPPDATA;
    if (localAppData === undefined) return [];
    return [
      {
        surface: "desktop",
        path: path.win32.join(localAppData, "Programs", "Antigravity", "Antigravity.exe"),
      },
      {
        surface: "ide",
        path: path.win32.join(localAppData, "Programs", "Antigravity IDE", "Antigravity IDE.exe"),
      },
      { surface: "cli", path: path.win32.join(platform.homeDirectory, ".local", "bin", "agy.exe") },
    ];
  }
  if (platform.platform === "darwin") {
    return [
      { surface: "desktop", path: "/Applications/Antigravity.app" },
      { surface: "ide", path: "/Applications/Antigravity IDE.app" },
      { surface: "cli", path: path.posix.join(platform.homeDirectory, ".local", "bin", "agy") },
    ];
  }
  return [
    { surface: "desktop", path: "/usr/bin/antigravity" },
    { surface: "ide", path: "/usr/bin/agy-ide" },
    { surface: "cli", path: path.posix.join(platform.homeDirectory, ".local", "bin", "agy") },
    { surface: "cli", path: "/usr/local/bin/agy" },
  ];
}
