import { createHash } from "node:crypto";
import path from "node:path";

import { z } from "zod";

import { AtomicTextFileWriter } from "../../core/filesystem/atomic-text-file-writer.js";
import type { FileSystem } from "../../core/filesystem/filesystem.js";
import type { ConcreteConnectorSurface, ConnectorOwnershipSummary } from "./connector-types.js";

const surfaceRecordSchema = z
  .object({
    surface: z.enum(["desktop", "ide", "cli"]),
    configIdentity: z.string().regex(/^[a-f0-9]{32}$/u),
    serverKey: z.literal("agentfold"),
    entryFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    backupIdentity: z.string().min(1).max(120).optional(),
  })
  .strict();

const workspaceRecordSchema = z
  .object({
    repositoryId: z.string().regex(/^[a-f0-9]{24}$/u),
    ruleRelativePath: z.literal(".agents/rules/agentfold-continuity.md"),
    ruleFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    connections: z
      .array(
        z
          .object({
            surface: z.enum(["desktop", "ide", "cli"]),
            configIdentity: z.string().regex(/^[a-f0-9]{32}$/u),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const connectorInstallationRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    connector: z.literal("antigravity"),
    connectorVersion: z.number().int().positive(),
    installedAt: z.string().datetime({ offset: true }),
    surfaces: z.array(surfaceRecordSchema),
    workspaces: z.array(workspaceRecordSchema),
    executableDescriptorFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict()
  .superRefine((record, context) => {
    const surfaceKeys = record.surfaces.map((item) => `${item.configIdentity}:${item.surface}`);
    if (new Set(surfaceKeys).size !== surfaceKeys.length) {
      context.addIssue({
        code: "custom",
        message: "Connector surface ownership contains duplicate records.",
        path: ["surfaces"],
      });
    }
    const repositoryIds = record.workspaces.map((item) => item.repositoryId);
    if (new Set(repositoryIds).size !== repositoryIds.length) {
      context.addIssue({
        code: "custom",
        message: "Connector workspace ownership contains duplicate records.",
        path: ["workspaces"],
      });
    }
    for (const [index, workspace] of record.workspaces.entries()) {
      const connectionKeys = workspace.connections.map(
        (item) => `${item.configIdentity}:${item.surface}`,
      );
      if (new Set(connectionKeys).size !== connectionKeys.length) {
        context.addIssue({
          code: "custom",
          message: "Connector workspace ownership contains duplicate connections.",
          path: ["workspaces", index, "connections"],
        });
      }
      if (connectionKeys.some((key) => !surfaceKeys.includes(key))) {
        context.addIssue({
          code: "custom",
          message: "Connector workspace ownership references an unknown surface record.",
          path: ["workspaces", index, "connections"],
        });
      }
    }
  });

export type ConnectorInstallationRecord = z.infer<typeof connectorInstallationRecordSchema>;
export type ConnectorSurfaceRecord = z.infer<typeof surfaceRecordSchema>;
export type ConnectorWorkspaceRecord = z.infer<typeof workspaceRecordSchema>;

export function connectorConfigIdentity(configPath: string, platform = process.platform): string {
  const normalized = platform === "win32" ? configPath.toLocaleLowerCase("en-US") : configPath;
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 32);
}

export function connectorRepositoryId(repositoryRoot: string, platform = process.platform): string {
  const normalized =
    platform === "win32" ? repositoryRoot.toLocaleLowerCase("en-US") : repositoryRoot;
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 24);
}

export class ConnectorOwnershipStore {
  readonly recordPath: string;

  constructor(
    private readonly fileSystem: FileSystem,
    stateDirectory: string,
    private readonly restrictFile: (filePath: string) => Promise<void> = async (filePath) => {
      if (process.platform !== "win32") {
        const { chmod } = await import("node:fs/promises");
        await chmod(filePath, 0o600);
      }
    },
  ) {
    this.recordPath = path.join(stateDirectory, "antigravity-ownership.json");
  }

  async read(): Promise<ConnectorInstallationRecord | undefined> {
    if (!(await this.fileSystem.exists(this.recordPath))) return undefined;
    const source = (await this.fileSystem.readText(this.recordPath)).replace(/^\uFEFF/u, "");
    return connectorInstallationRecordSchema.parse(JSON.parse(source));
  }

  async write(record: ConnectorInstallationRecord): Promise<void> {
    const validated = connectorInstallationRecordSchema.parse(record);
    await new AtomicTextFileWriter(this.fileSystem).write(
      this.recordPath,
      `${JSON.stringify(validated, undefined, 2)}\n`,
      (await this.fileSystem.exists(this.recordPath)) ? "replace" : "create",
    );
    await this.restrictFile(this.recordPath);
  }

  async remove(): Promise<void> {
    await this.fileSystem.remove(this.recordPath);
  }
}

export function summarizeConnectorOwnership(
  record: ConnectorInstallationRecord,
  stale = false,
): ConnectorOwnershipSummary {
  return {
    host: "antigravity",
    connectorVersion: record.connectorVersion,
    surfaceCount: record.surfaces.length,
    workspaceCount: record.workspaces.length,
    stale,
  };
}

export function surfaceRecord(
  surface: ConcreteConnectorSurface,
  configIdentity: string,
  entryFingerprint: string,
  backupIdentity?: string,
): ConnectorSurfaceRecord {
  return {
    surface,
    configIdentity,
    serverKey: "agentfold",
    entryFingerprint,
    ...(backupIdentity === undefined ? {} : { backupIdentity }),
  };
}
