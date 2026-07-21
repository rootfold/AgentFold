import { randomUUID } from "node:crypto";
import path from "node:path";

import { AtomicBinaryFileWriter } from "../../core/filesystem/atomic-binary-file-writer.js";
import type { FileSystem } from "../../core/filesystem/filesystem.js";

export interface SecureBackupInput {
  readonly fileSystem: FileSystem;
  readonly stateDirectory: string;
  readonly content: Uint8Array;
  readonly generateIdentity?: () => string;
  readonly restrictFile?: (filePath: string) => Promise<void>;
}

function safeIdentity(identity: string): string {
  if (!/^[a-zA-Z0-9_-]{8,100}$/u.test(identity)) {
    throw new Error("The generated backup identity is unsafe.");
  }
  return identity;
}

export async function restrictConnectorFile(filePath: string): Promise<void> {
  if (process.platform !== "win32") {
    const { chmod } = await import("node:fs/promises");
    await chmod(filePath, 0o600);
  }
}

export async function createSecureConnectorBackup(input: SecureBackupInput): Promise<string> {
  const identity = safeIdentity(input.generateIdentity?.() ?? randomUUID());
  const backupDirectory = path.join(input.stateDirectory, "backups");
  const backupPath = path.join(backupDirectory, `${identity}.backup`);
  const restrictFile = input.restrictFile ?? restrictConnectorFile;
  await new AtomicBinaryFileWriter(input.fileSystem, undefined, restrictFile).write(
    backupPath,
    input.content,
    "create",
  );
  await restrictFile(backupPath);
  return identity;
}
