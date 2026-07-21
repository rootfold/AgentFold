import path from "node:path";

import type { Diagnostic } from "../../../core/diagnostics/diagnostic.js";
import type { FileSystem } from "../../../core/filesystem/filesystem.js";
import type { ServicePlatformInput } from "../../service/runtime-directory.js";
import type { CodexConcreteConnectorSurface, ConnectorSurface } from "../connector-types.js";
import {
  codexAppEvidencePaths,
  codexCliExecutableCandidates,
  codexIdeExtensionDirectories,
  resolveCodexConfigPath,
  resolveCodexHomeDirectory,
} from "./codex-paths.js";

export interface CodexSurfaceDiscovery {
  readonly surface: CodexConcreteConnectorSurface;
  readonly installed: boolean | "unknown";
  readonly diagnostics: readonly Diagnostic[];
}

export interface CodexDiscovery {
  readonly configPath: string;
  readonly configExists: boolean;
  readonly codexHomeExists: boolean;
  readonly cliExecutable?: string;
  readonly surfaces: readonly CodexSurfaceDiscovery[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface DiscoverCodexInput {
  readonly fileSystem: FileSystem;
  readonly platform: ServicePlatformInput;
  readonly codexHome?: string;
}

async function firstExistingFile(
  fileSystem: FileSystem,
  candidates: readonly string[],
): Promise<string | undefined> {
  for (const candidate of candidates) {
    if ((await fileSystem.entryType(candidate)) === "file") return candidate;
  }
  return undefined;
}

async function hasIdeExtension(
  fileSystem: FileSystem,
  directories: readonly string[],
): Promise<boolean> {
  for (const directory of directories) {
    if ((await fileSystem.entryType(directory)) !== "directory") continue;
    try {
      const entries = await fileSystem.listDirectory(directory);
      if (
        entries.some((entry) => /^(openai\.(?:chatgpt|codex))(?:-|$)/iu.test(path.basename(entry)))
      ) {
        return true;
      }
    } catch {
      // Unreadable optional evidence does not make discovery unsafe.
    }
  }
  return false;
}

export async function discoverCodex(input: DiscoverCodexInput): Promise<CodexDiscovery> {
  const configPath = resolveCodexConfigPath(input.platform, input.codexHome);
  const codexHome = resolveCodexHomeDirectory(input.platform, input.codexHome);
  const [configExists, codexHomeExists, cliExecutable, appEvidence, ideEvidence] =
    await Promise.all([
      input.fileSystem.exists(configPath),
      input.fileSystem.exists(codexHome),
      firstExistingFile(input.fileSystem, codexCliExecutableCandidates(input.platform)),
      Promise.all(
        codexAppEvidencePaths(input.platform).map((candidate) =>
          input.fileSystem.exists(candidate),
        ),
      ).then((results) => results.some(Boolean)),
      hasIdeExtension(input.fileSystem, codexIdeExtensionDirectories(input.platform)),
    ]);
  const sharedEvidence = configExists || codexHomeExists;
  return {
    configPath,
    configExists,
    codexHomeExists,
    ...(cliExecutable === undefined ? {} : { cliExecutable }),
    surfaces: [
      {
        surface: "cli",
        installed: sharedEvidence || cliExecutable !== undefined ? true : "unknown",
        diagnostics: [],
      },
      {
        surface: "ide",
        installed: sharedEvidence || ideEvidence ? true : "unknown",
        diagnostics: [],
      },
      {
        surface: "app",
        installed: sharedEvidence || appEvidence ? true : "unknown",
        diagnostics: [],
      },
    ],
    diagnostics: [],
  };
}

export type CodexTargetSelection =
  | {
      readonly status: "selected";
      readonly configPath: string;
      readonly surfaces: readonly CodexConcreteConnectorSurface[];
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly status: "error";
      readonly exitCode: 2 | 6;
      readonly diagnostics: readonly Diagnostic[];
    };

export function selectCodexTarget(
  discovery: CodexDiscovery,
  requested: ConnectorSurface,
): CodexTargetSelection {
  if (requested === "desktop") {
    return {
      status: "error",
      exitCode: 2,
      diagnostics: [
        {
          code: "AFCD002",
          severity: "error",
          message: "Codex does not use the Antigravity `desktop` surface name.",
          suggestion: "Select auto, cli, ide, app, or all.",
        },
      ],
    };
  }
  if (requested !== "auto" && requested !== "all") {
    return {
      status: "selected",
      configPath: discovery.configPath,
      surfaces: [requested],
      diagnostics: [],
    };
  }
  const detected = discovery.surfaces
    .filter((surface) => surface.installed === true)
    .map((surface) => surface.surface);
  if (detected.length === 0) {
    return {
      status: "error",
      exitCode: 6,
      diagnostics: [
        {
          code: "AFCD001",
          severity: "error",
          message: "No supported Codex surface was detected.",
          suggestion: "Install Codex or select one explicit --surface.",
        },
      ],
    };
  }
  return {
    status: "selected",
    configPath: discovery.configPath,
    surfaces: requested === "all" ? detected : detected,
    diagnostics: [],
  };
}
