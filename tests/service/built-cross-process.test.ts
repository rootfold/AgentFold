import { spawn, execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/core/config/load-config.js";
import { parseConfig } from "../../src/core/config/parse-config.js";
import { serializeConfig } from "../../src/core/config/serialize-config.js";
import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";
import { FilesystemGitRepositoryLocator } from "../../src/core/git/filesystem-git-repository-locator.js";
import { AtomicInitializationWriter } from "../../src/core/initialization/atomic-writer.js";
import {
  commitInitialization,
  prepareInitialization,
} from "../../src/core/initialization/initialize.js";
import { agentFoldMcpToolNames } from "../../src/integrations/mcp/tool-names.js";
import { connectToAgentFoldService } from "../../src/integrations/service/service-client.js";

const run = promisify(execFile);
const temporaryDirectories: string[] = [];
const childProcesses: ReturnType<typeof spawn>[] = [];

afterEach(async () => {
  for (const child of childProcesses.splice(0)) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function envelope(result: unknown): Record<string, unknown> {
  if (typeof result !== "object" || result === null || !("structuredContent" in result)) return {};
  const value = result.structuredContent;
  return typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function data(result: unknown): Record<string, unknown> {
  const value = envelope(result).data;
  return typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}

async function git(root: string, ...arguments_: string[]): Promise<string> {
  return (await run("git", arguments_, { cwd: root })).stdout.trim();
}

async function createRepository(name: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), name));
  temporaryDirectories.push(root);
  await git(root, "init", "--quiet");
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "src", "app.ts"),
    "export const marker = 'SOURCE_NEVER_LEAKS';\n",
  );
  await writeFile(path.join(root, "README.md"), "# Shared service fixture\n");
  const fileSystem = new NodeFileSystem(() => root);
  const locator = new FilesystemGitRepositoryLocator(fileSystem);
  const plan = await prepareInitialization({
    fileSystem,
    gitRepositoryLocator: locator,
    agentfoldVersion: "0.0.0-test",
  });
  if (plan.status !== "ready") throw new Error("Expected service fixture initialization");
  await commitInitialization(
    plan,
    new AtomicInitializationWriter(fileSystem, () => ".service-init"),
  );
  const configPath = path.join(root, ".agentfold", "config.yaml");
  const config = await loadConfig(fileSystem, configPath);
  await writeFile(
    configPath,
    serializeConfig(
      parseConfig({
        ...config,
        automation: {
          enabled: true,
          sessions: { heartbeat_interval_seconds: 5, stale_after_seconds: 6 },
          checkpoints: {
            on_agent_switch: true,
            on_session_close: true,
            recovery_on_timeout: true,
            minimum_interval_seconds: 0,
          },
        },
      }),
    ),
  );
  return root;
}

async function waitForService(runtimeDirectory: string): Promise<void> {
  const fileSystem = new NodeFileSystem();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const connected = await connectToAgentFoldService({
      fileSystem,
      clientVersion: "0.0.0",
      runtimeDirectory,
      timeoutMilliseconds: 200,
    });
    if (connected.connected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Built service did not become ready");
}

async function openMcp(repositoryRoot: string, runtimeDirectory: string, label: string) {
  const projectRoot = path.resolve(import.meta.dirname, "..", "..");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.join(projectRoot, "dist", "cli.js"),
      "mcp",
      "--workspace",
      repositoryRoot,
      "--service",
      "required",
      "--debug",
    ],
    cwd: projectRoot,
    env: { ...process.env, AGENTFOLD_RUNTIME_DIR: runtimeDirectory },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const client = new Client({ name: label, version: "1.0.0" });
  await client.connect(transport);
  return { client, stderr: () => stderr };
}

describe("built shared-service workflow", () => {
  it("coordinates two MCP processes, an agent switch, timeout recovery, and another repository", async () => {
    if (process.env.AGENTFOLD_SERVICE_BUILT !== "1") return;
    const repositoryA = await createRepository("agentfold built service repo A with spaces ");
    const repositoryB = await createRepository("agentfold-built-service-repo-B-");
    const runtimeDirectory = await mkdtemp(
      path.join(os.tmpdir(), "agentfold built runtime with spaces "),
    );
    temporaryDirectories.push(runtimeDirectory);
    const projectRoot = path.resolve(import.meta.dirname, "..", "..");
    const service = spawn(
      process.execPath,
      [path.join(projectRoot, "dist", "cli.js"), "service", "run", "--debug"],
      {
        cwd: projectRoot,
        env: { ...process.env, AGENTFOLD_RUNTIME_DIR: runtimeDirectory },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    childProcesses.push(service);
    let serviceStdout = "";
    let serviceStderr = "";
    service.stdout.on("data", (chunk) => (serviceStdout += String(chunk)));
    service.stderr.on("data", (chunk) => (serviceStderr += String(chunk)));
    await waitForService(runtimeDirectory);

    const branchBefore = await git(repositoryA, "symbolic-ref", "HEAD");
    const stagedBefore = await git(repositoryA, "diff", "--cached", "--name-only");
    const hooksBefore = (await readdir(path.join(repositoryA, ".git", "hooks"))).sort();
    const antigravity = await openMcp(repositoryA, runtimeDirectory, "antigravity-host");
    const callA = (name: string, arguments_: Record<string, unknown>) =>
      antigravity.client.callTool({ name, arguments: arguments_ });
    const openedA = await callA(agentFoldMcpToolNames.openSession, {
      client: "antigravity-app",
      agent: "antigravity",
      target: "antigravity",
      resumeFormat: "json",
    });
    const sessionA = String(data(openedA).sessionId);
    await callA(agentFoldMcpToolNames.beginTask, {
      sessionId: sessionA,
      title: "Cross-process shared service",
      objective: "Preserve semantics and Git facts across applications",
    });
    await callA(agentFoldMcpToolNames.reportProgress, {
      sessionId: sessionA,
      completed: ["Reported semantic progress from Antigravity"],
      decisions: [{ decision: "Keep Git read-only", reason: "Preserve user state" }],
      nextActions: ["Continue from Codex"],
    });
    await writeFile(path.join(repositoryA, "src", "app.ts"), "export const changed = true;\n");

    const codex = await openMcp(repositoryA, runtimeDirectory, "codex-host");
    const callC = (name: string, arguments_: Record<string, unknown>) =>
      codex.client.callTool({ name, arguments: arguments_ });
    const openedC = await callC(agentFoldMcpToolNames.openSession, {
      client: "codex-app",
      agent: "codex",
      target: "codex",
      resumeFormat: "json",
    });
    expect(envelope(openedC).status).toBe("resumable");
    const packet = data(openedC).resumePacket as Record<string, unknown>;
    expect((packet.semanticState as Record<string, unknown>).completed).toContain(
      "Reported semantic progress from Antigravity",
    );
    expect((packet.observedGitState as Record<string, unknown>).changedPaths).toBeDefined();
    const superseded = await callA(agentFoldMcpToolNames.getResumePacket, {
      sessionId: sessionA,
      format: "json",
    });
    expect(envelope(superseded).status).toBe("closed_session");
    const sessionC = String(data(openedC).sessionId);
    await codex.client.close();
    await new Promise((resolve) => setTimeout(resolve, 7_500));
    const history = await readdir(path.join(repositoryA, ".agentfold", "state", "history"));
    expect(history).toHaveLength(1);

    const independent = await openMcp(repositoryB, runtimeDirectory, "independent-host");
    const openedB = await independent.client.callTool({
      name: agentFoldMcpToolNames.openSession,
      arguments: { client: "codex-app", agent: "codex", target: "generic", resumeFormat: "json" },
    });
    expect(envelope(openedB).status).toBe("no_active_task");
    await independent.client.close();
    await antigravity.client.close();

    const connected = await connectToAgentFoldService({
      fileSystem: new NodeFileSystem(),
      clientVersion: "0.0.0",
      runtimeDirectory,
    });
    if (!connected.connected) throw new Error("Expected connected service");
    await connected.client.shutdown();
    await new Promise<void>((resolve) => service.once("exit", () => resolve()));

    expect(serviceStdout).toBe("");
    expect(serviceStderr).not.toContain("SOURCE_NEVER_LEAKS");
    expect(serviceStderr).not.toContain(repositoryA);
    expect(antigravity.stderr()).not.toContain("SOURCE_NEVER_LEAKS");
    expect(codex.stderr()).not.toContain("SOURCE_NEVER_LEAKS");
    expect(JSON.stringify(openedC)).not.toContain(repositoryA);
    expect(JSON.stringify(openedC)).not.toContain("diff --git");
    expect(await git(repositoryA, "symbolic-ref", "HEAD")).toBe(branchBefore);
    expect(await git(repositoryA, "diff", "--cached", "--name-only")).toBe(stagedBefore);
    expect((await readdir(path.join(repositoryA, ".git", "hooks"))).sort()).toEqual(hooksBefore);
    await expect(readFile(path.join(runtimeDirectory, "service.json"), "utf8")).rejects.toThrow();
    expect(sessionC).toMatch(/^svc-/u);
  }, 90_000);
});
