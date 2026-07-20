import path from "node:path";
import { z } from "zod";

import { AtomicTextFileWriter } from "../../core/filesystem/atomic-text-file-writer.js";
import type { FileSystem } from "../../core/filesystem/filesystem.js";
import { agentFoldServiceProtocolVersion } from "./service-protocol.js";

const runtimeMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    protocolVersion: z.literal(agentFoldServiceProtocolVersion),
    serviceVersion: z.string().trim().min(1).max(100),
    pid: z.number().int().positive(),
    startedAt: z.string().datetime({ offset: true }),
    endpointKind: z.enum(["named-pipe", "unix-socket"]),
    endpoint: z.string().trim().min(1).max(32_768),
    token: z.string().min(43).max(1_024),
  })
  .strict();

export type ServiceRuntimeMetadata = z.infer<typeof runtimeMetadataSchema>;

export const serviceRuntimeMetadataFileName = "service.json";

export function serviceRuntimeMetadataPath(runtimeDirectory: string): string {
  return path.join(runtimeDirectory, serviceRuntimeMetadataFileName);
}

export function parseServiceRuntimeMetadata(input: unknown): ServiceRuntimeMetadata {
  return runtimeMetadataSchema.parse(input);
}

export async function readServiceRuntimeMetadata(
  fileSystem: FileSystem,
  runtimeDirectory: string,
): Promise<ServiceRuntimeMetadata | undefined> {
  const metadataPath = serviceRuntimeMetadataPath(runtimeDirectory);
  if (!(await fileSystem.exists(metadataPath))) return undefined;
  const source = await fileSystem.readText(metadataPath);
  return parseServiceRuntimeMetadata(JSON.parse(source.replace(/^\uFEFF/u, "")));
}

export async function writeServiceRuntimeMetadata(
  fileSystem: FileSystem,
  runtimeDirectory: string,
  metadata: ServiceRuntimeMetadata,
  restrictFile: (filePath: string) => Promise<void> = async (filePath) => {
    if (process.platform !== "win32") {
      const { chmod } = await import("node:fs/promises");
      await chmod(filePath, 0o600);
    }
  },
): Promise<void> {
  const parsed = parseServiceRuntimeMetadata(metadata);
  const metadataPath = serviceRuntimeMetadataPath(runtimeDirectory);
  await new AtomicTextFileWriter(fileSystem).write(
    metadataPath,
    `${JSON.stringify(parsed, undefined, 2)}\n`,
    (await fileSystem.exists(metadataPath)) ? "replace" : "create",
  );
  await restrictFile(metadataPath);
}

export async function removeServiceRuntimeMetadata(
  fileSystem: FileSystem,
  runtimeDirectory: string,
): Promise<void> {
  await fileSystem.remove(serviceRuntimeMetadataPath(runtimeDirectory));
}
