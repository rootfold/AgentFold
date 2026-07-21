import { z } from "zod";

import type { Diagnostic } from "../../core/diagnostics/diagnostic.js";

export const connectorHosts = ["antigravity"] as const;
export const connectorHostSchema = z.enum(connectorHosts);
export type ConnectorHost = z.infer<typeof connectorHostSchema>;

export const connectorSurfaces = ["auto", "desktop", "ide", "cli", "all"] as const;
export const connectorSurfaceSchema = z.enum(connectorSurfaces);
export type ConnectorSurface = z.infer<typeof connectorSurfaceSchema>;
export type ConcreteConnectorSurface = Exclude<ConnectorSurface, "auto" | "all">;

export interface LaunchDescriptor {
  readonly command: string;
  readonly argsPrefix: readonly string[];
  readonly fingerprint: string;
}

export interface ConnectorPlannedAction {
  readonly kind:
    | "create_config"
    | "modify_config"
    | "create_backup"
    | "create_rule"
    | "update_rule"
    | "remove_entry"
    | "remove_rule"
    | "write_ownership";
  readonly target: string;
  readonly description: string;
}

export interface ConnectorActionPlan {
  readonly host: ConnectorHost;
  readonly operation: "connect" | "disconnect";
  readonly safe: boolean;
  readonly actions: readonly ConnectorPlannedAction[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface ConnectorVerificationResult {
  readonly host: ConnectorHost;
  readonly valid: boolean;
  readonly toolsAvailable: number;
  readonly serviceAvailable: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ConnectorOwnershipSummary {
  readonly host: ConnectorHost;
  readonly connectorVersion: number;
  readonly surfaceCount: number;
  readonly workspaceCount: number;
  readonly stale: boolean;
}
