import path from "node:path";

import { z } from "zod";

import { AtomicTextFileWriter } from "../../../core/filesystem/atomic-text-file-writer.js";
import type { FileSystem } from "../../../core/filesystem/filesystem.js";

const codexSurfaceSchema = z.enum(["cli", "ide", "app"]);

const surfaceRecordSchema = z
  .object({
    surface: codexSurfaceSchema,
    configIdentity: z.string().regex(/^[a-f0-9]{32}$/u),
    serverKey: z.literal("agentfold"),
    regionFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    backupIdentity: z.string().min(1).max(120).optional(),
  })
  .strict();

const connectionSchema = z
  .object({
    surface: codexSurfaceSchema,
    configIdentity: z.string().regex(/^[a-f0-9]{32}$/u),
  })
  .strict();

const workspaceRecordSchema = z
  .object({
    repositoryId: z.string().regex(/^[a-f0-9]{24}$/u),
    repositoryFamilyId: z.string().regex(/^[a-f0-9]{24}$/u),
    worktreeKind: z.enum(["main", "linked"]),
    agentsRelativePath: z.literal("AGENTS.md"),
    agentsRegionFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    connections: z.array(connectionSchema).min(1),
  })
  .strict();

export const codexInstallationRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    connector: z.literal("codex"),
    connectorVersion: z.number().int().positive(),
    installedAt: z.string().datetime({ offset: true }),
    surfaces: z.array(surfaceRecordSchema),
    workspaces: z.array(workspaceRecordSchema),
    executableDescriptorFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict()
  .superRefine((record, context) => {
    const surfaceKeys = record.surfaces.map(
      (surface) => `${surface.configIdentity}:${surface.surface}`,
    );
    if (surfaceKeys.length !== new Set(surfaceKeys).size) {
      context.addIssue({
        code: "custom",
        message: "Codex surface ownership is duplicated.",
        path: ["surfaces"],
      });
    }
    const repositoryIds = record.workspaces.map((workspace) => workspace.repositoryId);
    if (repositoryIds.length !== new Set(repositoryIds).size) {
      context.addIssue({
        code: "custom",
        message: "Codex workspace ownership is duplicated.",
        path: ["workspaces"],
      });
    }
    for (const [index, workspace] of record.workspaces.entries()) {
      const connectionKeys = workspace.connections.map(
        (connection) => `${connection.configIdentity}:${connection.surface}`,
      );
      if (connectionKeys.length !== new Set(connectionKeys).size) {
        context.addIssue({
          code: "custom",
          message: "Codex workspace connections are duplicated.",
          path: ["workspaces", index, "connections"],
        });
      }
      if (connectionKeys.some((key) => !surfaceKeys.includes(key))) {
        context.addIssue({
          code: "custom",
          message: "Codex workspace ownership references an unknown surface.",
          path: ["workspaces", index, "connections"],
        });
      }
    }
  });

export type CodexInstallationRecord = z.infer<typeof codexInstallationRecordSchema>;
export type CodexSurfaceRecord = z.infer<typeof surfaceRecordSchema>;
export type CodexWorkspaceRecord = z.infer<typeof workspaceRecordSchema>;

export class CodexOwnershipStore {
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
    this.recordPath = path.join(stateDirectory, "codex-ownership.json");
  }

  async read(): Promise<CodexInstallationRecord | undefined> {
    if (!(await this.fileSystem.exists(this.recordPath))) return undefined;
    const source = (await this.fileSystem.readText(this.recordPath)).replace(/^\uFEFF/u, "");
    return codexInstallationRecordSchema.parse(JSON.parse(source));
  }

  async write(record: CodexInstallationRecord): Promise<void> {
    const validated = codexInstallationRecordSchema.parse(record);
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
