import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

import { z } from "zod";

import type { FileSystem } from "../../core/filesystem/filesystem.js";
import type { ProcessRunner } from "../../core/process/process-runner.js";
import type { LaunchDescriptor } from "./connector-types.js";

const packageDescriptorSchema = z
  .object({
    name: z.literal("agentfold"),
    bin: z.union([z.string().min(1), z.object({ agentfold: z.string().min(1) }).passthrough()]),
  })
  .passthrough();

export interface ResolveLaunchDescriptorInput {
  readonly fileSystem: FileSystem;
  readonly processRunner: ProcessRunner;
  readonly executable?: string;
  readonly modulePath?: string;
  readonly allowTemporaryPath?: boolean;
}

export function fingerprintLaunchDescriptor(
  descriptor: Pick<LaunchDescriptor, "command" | "argsPrefix">,
): string {
  return createHash("sha256")
    .update(JSON.stringify([descriptor.command, ...descriptor.argsPrefix]), "utf8")
    .digest("hex");
}

async function findPackageRoot(
  fileSystem: FileSystem,
  modulePath: string,
): Promise<{ readonly root: string; readonly cliEntry: string } | undefined> {
  let directory = path.dirname(modulePath);
  for (let depth = 0; depth < 8; depth += 1) {
    const packagePath = path.join(directory, "package.json");
    if (await fileSystem.exists(packagePath)) {
      try {
        const parsed = packageDescriptorSchema.parse(
          JSON.parse((await fileSystem.readText(packagePath)).replace(/^\uFEFF/u, "")),
        );
        const relativeEntry = typeof parsed.bin === "string" ? parsed.bin : parsed.bin.agentfold;
        return { root: directory, cliEntry: path.resolve(directory, relativeEntry) };
      } catch {
        // A different package boundary is not an AgentFold installation.
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return undefined;
}

export async function resolveAgentFoldLaunchDescriptor(
  input: ResolveLaunchDescriptorInput,
): Promise<LaunchDescriptor> {
  const executable = path.resolve(input.executable ?? process.execPath);
  const executableName = path.basename(executable).toLocaleLowerCase("en-US");
  if (
    ["npm", "npm.cmd", "npx", "npx.cmd", "pnpm", "pnpm.cmd", "yarn", "yarn.cmd"].includes(
      executableName,
    ) ||
    [".bat", ".cmd", ".ps1"].includes(path.extname(executableName))
  ) {
    throw new Error("Package-manager and shell shims cannot be installed as MCP executables.");
  }
  const modulePath = input.modulePath ?? fileURLToPath(import.meta.url);
  const packageLocation = await findPackageRoot(input.fileSystem, modulePath);
  if (packageLocation === undefined) {
    throw new Error("The installed AgentFold package boundary could not be resolved.");
  }
  if ((await input.fileSystem.entryType(executable)) !== "file") {
    throw new Error("The Node.js executable for AgentFold is missing or unreadable.");
  }
  if ((await input.fileSystem.entryType(packageLocation.cliEntry)) !== "file") {
    throw new Error(
      "The production AgentFold CLI entry is missing; run the AgentFold build first.",
    );
  }
  if (input.allowTemporaryPath !== true) {
    const relativeToTemporary = path.relative(os.tmpdir(), packageLocation.cliEntry);
    if (
      relativeToTemporary === "" ||
      (!relativeToTemporary.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeToTemporary))
    ) {
      throw new Error("A temporary AgentFold build cannot be installed into host configuration.");
    }
  }
  const loaded = await input.processRunner.run(
    executable,
    [packageLocation.cliEntry, "--version"],
    {
      cwd: packageLocation.root,
    },
  );
  if (loaded.exitCode !== 0) {
    throw new Error("The production AgentFold CLI entry could not be loaded.");
  }
  const base = { command: executable, argsPrefix: [packageLocation.cliEntry] };
  return { ...base, fingerprint: fingerprintLaunchDescriptor(base) };
}
