import path from "node:path";

import type { Diagnostic } from "../../../core/diagnostics/diagnostic.js";
import type { FileSystem } from "../../../core/filesystem/filesystem.js";
import type { AntigravityConcreteConnectorSurface, ConnectorSurface } from "../connector-types.js";
import type { ServicePlatformInput } from "../../service/runtime-directory.js";
import {
  antigravityConfigCandidateDefinitions,
  antigravityExecutableCandidates,
  type AntigravityConfigCandidateDefinition,
} from "./antigravity-paths.js";

export interface AntigravityConfigCandidate extends AntigravityConfigCandidateDefinition {
  readonly exists: boolean;
  readonly parentExists: boolean;
}

export interface AntigravitySurfaceDiscovery {
  readonly surface: AntigravityConcreteConnectorSurface;
  readonly installed: boolean | "unknown";
  readonly configCandidates: readonly AntigravityConfigCandidate[];
  readonly selectedConfig?: AntigravityConfigCandidate;
  readonly diagnostics: readonly Diagnostic[];
}

export interface AntigravityDiscovery {
  readonly surfaces: readonly AntigravitySurfaceDiscovery[];
  readonly workspaceCandidate: AntigravityConfigCandidate;
  readonly diagnostics: readonly Diagnostic[];
}

export interface DiscoverAntigravityInput {
  readonly fileSystem: FileSystem;
  readonly platform: ServicePlatformInput;
  readonly repositoryRoot: string;
}

export async function discoverAntigravity(
  input: DiscoverAntigravityInput,
): Promise<AntigravityDiscovery> {
  const definitions = antigravityConfigCandidateDefinitions(input.platform, input.repositoryRoot);
  const candidates = await Promise.all(
    definitions.map(async (candidate): Promise<AntigravityConfigCandidate> => ({
      ...candidate,
      exists: await input.fileSystem.exists(candidate.path),
      parentExists: await input.fileSystem.exists(path.dirname(candidate.path)),
    })),
  );
  const executableEvidence = new Set<AntigravityConcreteConnectorSurface>();
  for (const executable of antigravityExecutableCandidates(input.platform)) {
    if (await input.fileSystem.exists(executable.path)) executableEvidence.add(executable.surface);
  }
  const surfaces = (["desktop", "ide", "cli"] as const).map(
    (surface): AntigravitySurfaceDiscovery => {
      const relevant = candidates.filter(
        (candidate) => candidate.scope === "global" && candidate.surfaces.includes(surface),
      );
      const installed =
        relevant.some((candidate) => candidate.exists || candidate.parentExists) ||
        executableEvidence.has(surface)
          ? true
          : "unknown";
      return { surface, installed, configCandidates: relevant, diagnostics: [] };
    },
  );
  return {
    surfaces,
    workspaceCandidate: candidates.find((candidate) => candidate.id === "workspace")!,
    diagnostics: [],
  };
}

export type AntigravityTargetSelection =
  | {
      readonly status: "selected";
      readonly targets: readonly {
        readonly candidate: AntigravityConfigCandidate;
        readonly surfaces: readonly AntigravityConcreteConnectorSurface[];
      }[];
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly status: "error";
      readonly exitCode: 5 | 6;
      readonly diagnostics: readonly Diagnostic[];
    };

function uniqueTargets(
  targets: readonly {
    readonly candidate: AntigravityConfigCandidate;
    readonly surface: AntigravityConcreteConnectorSurface;
  }[],
): readonly {
  readonly candidate: AntigravityConfigCandidate;
  readonly surfaces: readonly AntigravityConcreteConnectorSurface[];
}[] {
  const byPath = new Map<
    string,
    { candidate: AntigravityConfigCandidate; surfaces: Set<AntigravityConcreteConnectorSurface> }
  >();
  for (const target of targets) {
    const existing = byPath.get(target.candidate.path) ?? {
      candidate: target.candidate,
      surfaces: new Set<AntigravityConcreteConnectorSurface>(),
    };
    existing.surfaces.add(target.surface);
    byPath.set(target.candidate.path, existing);
  }
  return [...byPath.values()].map((item) => ({
    candidate: item.candidate,
    surfaces: [...item.surfaces],
  }));
}

function selectedForSurface(
  discovery: AntigravityDiscovery,
  surface: AntigravityConcreteConnectorSurface,
): AntigravityConfigCandidate | "ambiguous" | undefined {
  const current = discovery.surfaces.find((item) => item.surface === surface)!;
  const existing = current.configCandidates.filter((candidate) => candidate.exists);
  if (existing.length > 1) return "ambiguous";
  if (existing.length === 1) return existing[0];
  const parentEvidence = current.configCandidates.filter((candidate) => candidate.parentExists);
  if (parentEvidence.length > 1) return "ambiguous";
  if (parentEvidence.length === 1) return parentEvidence[0];
  return [...current.configCandidates].sort((left, right) => left.rank - right.rank)[0];
}

export function selectAntigravityTargets(
  discovery: AntigravityDiscovery,
  requested: ConnectorSurface,
): AntigravityTargetSelection {
  const ambiguity = (): AntigravityTargetSelection => ({
    status: "error",
    exitCode: 5,
    diagnostics: [
      {
        code: "AFCN002",
        severity: "error",
        message:
          "Several Antigravity MCP configuration files are equally supported by local evidence.",
        suggestion:
          "Select a specific --surface, or use --surface all after reviewing every target.",
      },
    ],
  });
  if (requested === "app") {
    return {
      status: "error",
      exitCode: 5,
      diagnostics: [
        {
          code: "AFCN002",
          severity: "error",
          message: "Antigravity does not use the Codex `app` surface name.",
          suggestion: "Select auto, desktop, ide, cli, or all.",
        },
      ],
    };
  }
  if (requested === "all") {
    const targets: {
      candidate: AntigravityConfigCandidate;
      surface: AntigravityConcreteConnectorSurface;
    }[] = [];
    for (const surface of discovery.surfaces.filter((item) => item.installed === true)) {
      const selected = selectedForSurface(discovery, surface.surface);
      if (selected === "ambiguous") {
        for (const candidate of surface.configCandidates.filter(
          (item) => item.exists || item.parentExists,
        )) {
          targets.push({ candidate, surface: surface.surface });
        }
      } else if (selected !== undefined)
        targets.push({ candidate: selected, surface: surface.surface });
    }
    if (targets.length === 0) {
      return {
        status: "error",
        exitCode: 6,
        diagnostics: [
          {
            code: "AFCN001",
            severity: "error",
            message: "No supported Antigravity surface was detected.",
            suggestion: "Install Antigravity or select one explicit --surface.",
          },
        ],
      };
    }
    return { status: "selected", targets: uniqueTargets(targets), diagnostics: [] };
  }
  if (requested !== "auto") {
    const selected = selectedForSurface(discovery, requested);
    if (selected === "ambiguous") return ambiguity();
    if (selected === undefined) return ambiguity();
    return {
      status: "selected",
      targets: [{ candidate: selected, surfaces: [requested] }],
      diagnostics: [],
    };
  }
  const existing = new Map<string, AntigravityConfigCandidate>();
  for (const surface of discovery.surfaces) {
    for (const candidate of surface.configCandidates.filter((item) => item.exists)) {
      existing.set(candidate.path, candidate);
    }
  }
  if (existing.size > 1) return ambiguity();
  if (existing.size === 1) {
    const candidate = [...existing.values()][0]!;
    return {
      status: "selected",
      targets: [
        {
          candidate,
          surfaces: discovery.surfaces
            .filter((surface) => candidate.surfaces.includes(surface.surface))
            .map((surface) => surface.surface),
        },
      ],
      diagnostics: [],
    };
  }
  const detected = discovery.surfaces.filter((surface) => surface.installed === true);
  if (detected.length === 0) {
    return {
      status: "error",
      exitCode: 6,
      diagnostics: [
        {
          code: "AFCN001",
          severity: "error",
          message: "No supported Antigravity surface was detected.",
          suggestion: "Install Antigravity or pass an explicit --surface.",
        },
      ],
    };
  }
  const inferred = detected.map((surface) => ({
    surface: surface.surface,
    candidate: selectedForSurface(discovery, surface.surface),
  }));
  if (inferred.some((item) => item.candidate === "ambiguous" || item.candidate === undefined)) {
    return ambiguity();
  }
  const targets = uniqueTargets(
    inferred.map((item) => ({
      surface: item.surface,
      candidate: item.candidate as AntigravityConfigCandidate,
    })),
  );
  if (targets.length > 1) return ambiguity();
  return { status: "selected", targets, diagnostics: [] };
}
