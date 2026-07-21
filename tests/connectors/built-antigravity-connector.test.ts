import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";
import { FilesystemGitRepositoryLocator } from "../../src/core/git/filesystem-git-repository-locator.js";
import { AtomicInitializationWriter } from "../../src/core/initialization/atomic-writer.js";
import {
  commitInitialization,
  prepareInitialization,
} from "../../src/core/initialization/initialize.js";
import { agentFoldMcpToolNames } from "../../src/integrations/mcp/tool-names.js";

const run = promisify(execFile);
const temporaryDirectories: string[] = [];
const spawnedEnvironments: NodeJS.ProcessEnv[] = [];

afterEach(async () => {
  const cli = path.resolve(import.meta.dirname, "..", "..", "dist", "cli.js");
  await Promise.all(
    spawnedEnvironments
      .splice(0)
      .map((env) =>
        run(process.execPath, [cli, "service", "stop"], { env }).catch(() => undefined),
      ),
  );
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function git(root: string, ...arguments_: string[]): Promise<string> {
  return (await run("git", arguments_, { cwd: root })).stdout.trim();
}

async function optionalGit(root: string, ...arguments_: string[]): Promise<string> {
  try {
    return await git(root, ...arguments_);
  } catch {
    return "<unborn>";
  }
}

async function initializedRepository(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agentfold Antigravity project with spaces "));
  temporaryDirectories.push(root);
  await git(root, "init", "--quiet");
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "fixture.ts"), "export const PRIVATE_SOURCE = true;\n");
  const fileSystem = new NodeFileSystem(() => root);
  const locator = new FilesystemGitRepositoryLocator(fileSystem);
  const plan = await prepareInitialization({
    fileSystem,
    gitRepositoryLocator: locator,
    agentfoldVersion: "0.0.0-test",
    now: () => new Date("2026-07-21T12:00:00.000Z"),
  });
  if (plan.status !== "ready") throw new Error("Expected initialized connector fixture");
  await commitInitialization(plan, new AtomicInitializationWriter(fileSystem, () => ".agy-init"));
  return root;
}

function resultData(result: unknown): Record<string, unknown> {
  if (typeof result !== "object" || result === null || !("structuredContent" in result)) return {};
  const structured = result.structuredContent;
  if (typeof structured !== "object" || structured === null || !("data" in structured)) return {};
  const data = structured.data;
  return typeof data === "object" && data !== null ? { ...data } : {};
}

async function connectInstalledMcp(
  command: string,
  args: readonly string[],
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv,
) {
  const transport = new StdioClientTransport({
    command,
    args: [...args],
    cwd: repositoryRoot,
    env: Object.fromEntries(
      Object.entries(environment).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const client = new Client(
    { name: "antigravity-fixture", version: "1.0.0" },
    { capabilities: { roots: { listChanged: true } } },
  );
  client.setRequestHandler(ListRootsRequestSchema, () => ({
    roots: [{ uri: pathToFileURL(repositoryRoot).toString(), name: "fixture" }],
  }));
  await client.connect(transport);
  return { client, stderr: () => stderr };
}

describe("built Antigravity connector workflow", () => {
  it.skipIf(process.env.AGENTFOLD_CONNECTOR_BUILT !== "1")(
    "previews, installs, auto-starts, hands off, verifies, and disconnects safely",
    async () => {
      const repositoryRoot = await initializedRepository();
      const home = await mkdtemp(path.join(os.tmpdir(), "agentfold isolated home Å "));
      const runtime = await mkdtemp(path.join(os.tmpdir(), "agentfold isolated runtime "));
      const state = await mkdtemp(path.join(os.tmpdir(), "agentfold isolated connector state "));
      temporaryDirectories.push(home, runtime, state);
      const configPath = path.join(home, ".gemini", "config", "mcp_config.json");
      await mkdir(path.dirname(configPath), { recursive: true });
      const fakeSecret = "FAKE_CONNECTOR_SECRET_MUST_NOT_LEAK";
      const originalConfig = `{
  "mcpServers": {
    "unrelated": {
      "serverUrl": "https://example.test/mcp",
      "headers": { "Authorization": "${fakeSecret}" }
    }
  },
  "theme": "preserve-me"
}
`;
      await writeFile(configPath, originalConfig, "utf8");
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        LOCALAPPDATA: path.join(home, "Local App Data"),
        AGENTFOLD_CONNECTOR_STATE_DIR: state,
        AGENTFOLD_RUNTIME_DIR: runtime,
      };
      spawnedEnvironments.push(env);
      const cli = path.resolve(import.meta.dirname, "..", "..", "dist", "cli.js");
      const runCli = (...arguments_: string[]) =>
        run(process.execPath, [cli, ...arguments_], {
          cwd: repositoryRoot,
          env,
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
        });
      const branchBefore = await git(repositoryRoot, "symbolic-ref", "HEAD");
      const branchesBefore = await git(repositoryRoot, "branch", "--list");
      const headBefore = await optionalGit(repositoryRoot, "rev-parse", "--verify", "HEAD");
      const remotesBefore = await git(repositoryRoot, "remote", "-v");
      const stashBefore = await git(repositoryRoot, "stash", "list");
      const stagedBefore = await git(repositoryRoot, "diff", "--cached", "--name-only");
      const hooksBefore = (await readdir(path.join(repositoryRoot, ".git", "hooks"))).sort();
      const sourceBefore = await readFile(path.join(repositoryRoot, "src", "fixture.ts"), "utf8");

      const preview = await runCli("connect", "antigravity", "--surface", "ide");
      expect(preview.stdout).toContain("No files were changed");
      expect(preview.stdout).not.toContain(home);
      expect(preview.stdout).not.toContain(fakeSecret);
      expect(await readFile(configPath, "utf8")).toBe(originalConfig);
      await expect(stat(path.join(repositoryRoot, ".agents"))).rejects.toThrow();

      const installed = await runCli("connect", "antigravity", "--surface", "ide", "--yes");
      expect(installed.stdout).toContain("connector was installed");
      expect(installed.stdout).not.toContain(fakeSecret);
      expect(installed.stderr).not.toContain(fakeSecret);
      const installedConfig = JSON.parse(await readFile(configPath, "utf8")) as {
        mcpServers: Record<string, { command: string; args: string[] }>;
        theme: string;
      };
      expect(installedConfig.theme).toBe("preserve-me");
      expect(installedConfig.mcpServers.unrelated).toBeDefined();
      const installedEntry = installedConfig.mcpServers.agentfold!;
      expect(installedEntry.args).toContain("--ensure-service");
      expect(installedEntry.args).toContain("auto");
      expect(installedEntry.args.join(" ")).not.toContain(repositoryRoot);
      expect(
        await readFile(
          path.join(repositoryRoot, ".agents", "rules", "agentfold-continuity.md"),
          "utf8",
        ),
      ).toContain("agentfold_open_session");
      expect((await readdir(path.join(state, "backups"))).length).toBe(1);
      expect(
        await readFile(
          path.join(state, "backups", (await readdir(path.join(state, "backups")))[0]!),
          "utf8",
        ),
      ).toBe(originalConfig);

      const first = await connectInstalledMcp(
        installedEntry.command,
        installedEntry.args,
        repositoryRoot,
        env,
      );
      expect((await first.client.listTools()).tools).toHaveLength(8);
      const opened = await first.client.callTool({
        name: agentFoldMcpToolNames.openSession,
        arguments: { client: "antigravity-ide", agent: "antigravity", target: "antigravity" },
      });
      const firstSession = String(resultData(opened).sessionId);
      await first.client.callTool({
        name: agentFoldMcpToolNames.beginTask,
        arguments: {
          sessionId: firstSession,
          title: "Connector fixture task",
          objective: "Verify Antigravity continuity",
        },
      });
      await first.client.callTool({
        name: agentFoldMcpToolNames.reportProgress,
        arguments: { sessionId: firstSession, completed: ["Installed connector safely"] },
      });
      await first.client.callTool({
        name: agentFoldMcpToolNames.closeSession,
        arguments: { sessionId: firstSession, createCheckpoint: true },
      });
      await first.client.close();

      const second = await connectInstalledMcp(
        installedEntry.command,
        installedEntry.args,
        repositoryRoot,
        env,
      );
      const resumed = await second.client.callTool({
        name: agentFoldMcpToolNames.openSession,
        arguments: { client: "second-agent", agent: "codex", target: "codex" },
      });
      expect(JSON.stringify(resumed)).toContain("Installed connector safely");
      expect(JSON.stringify(resumed)).not.toContain(repositoryRoot);
      expect(JSON.stringify(resumed)).not.toContain("PRIVATE_SOURCE");
      expect(JSON.stringify(resumed)).not.toContain("diff --git");
      await second.client.close();
      expect(first.stderr()).not.toContain(fakeSecret);
      expect(second.stderr()).not.toContain(fakeSecret);

      const verified = await runCli("verify", "antigravity");
      expect(verified.stdout).toContain("verification passed");
      expect(verified.stdout).toContain("Tools: 8");
      const disconnected = await runCli("disconnect", "antigravity", "--yes");
      expect(disconnected.stdout).toContain("service was left running");
      const after = JSON.parse(await readFile(configPath, "utf8")) as {
        mcpServers: Record<string, unknown>;
        theme: string;
      };
      expect(after.mcpServers.agentfold).toBeUndefined();
      expect(after.mcpServers.unrelated).toBeDefined();
      expect(after.theme).toBe("preserve-me");
      expect(await readFile(configPath, "utf8")).toContain(fakeSecret);
      await expect(
        stat(path.join(repositoryRoot, ".agents", "rules", "agentfold-continuity.md")),
      ).rejects.toThrow();
      expect((await runCli("service", "status")).stdout).toContain("Running: yes");
      expect(await git(repositoryRoot, "symbolic-ref", "HEAD")).toBe(branchBefore);
      expect(await git(repositoryRoot, "branch", "--list")).toBe(branchesBefore);
      expect(await optionalGit(repositoryRoot, "rev-parse", "--verify", "HEAD")).toBe(headBefore);
      expect(await git(repositoryRoot, "remote", "-v")).toBe(remotesBefore);
      expect(await git(repositoryRoot, "stash", "list")).toBe(stashBefore);
      expect(await git(repositoryRoot, "diff", "--cached", "--name-only")).toBe(stagedBefore);
      expect((await readdir(path.join(repositoryRoot, ".git", "hooks"))).sort()).toEqual(
        hooksBefore,
      );
      expect(await readFile(path.join(repositoryRoot, "src", "fixture.ts"), "utf8")).toBe(
        sourceBefore,
      );
    },
    120_000,
  );
});
