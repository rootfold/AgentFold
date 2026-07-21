import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  automationPolicySchema,
  defaultAutomationPolicy,
  resolveAutomationPolicy,
} from "../../src/core/config/automation-policy.js";
import { parseConfig } from "../../src/core/config/parse-config.js";
import { serializeConfig } from "../../src/core/config/serialize-config.js";
import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";
import {
  capabilityTokensEqual,
  generateCapabilityToken,
} from "../../src/integrations/service/authentication.js";
import { RepositoryOperationQueue } from "../../src/integrations/service/operation-queue.js";
import {
  createServiceEndpoint,
  safeRuntimeIdentifier,
} from "../../src/integrations/service/service-endpoint.js";
import {
  prepareServiceRuntimeDirectory,
  resolveServiceRuntimeLocation,
} from "../../src/integrations/service/runtime-directory.js";
import { ServiceSessionRegistry } from "../../src/integrations/service/session-registry.js";

const temporaryDirectories: string[] = [];

class DarwinAliasFileSystem extends NodeFileSystem {
  override ensureDirectory(): Promise<void> {
    return Promise.resolve();
  }

  override isSymbolicLink(candidate: string): Promise<boolean> {
    return Promise.resolve(candidate === "/var" || candidate === "/var/folders/escaped");
  }

  override realPath(candidate: string): Promise<string> {
    if (candidate === "/var") return Promise.resolve("/private/var");
    if (candidate.startsWith("/var/folders/escaped")) return Promise.resolve("/outside/runtime");
    return Promise.resolve(candidate.replace(/^\/var(?=\/|$)/u, "/private/var"));
  }
}

class WindowsShortNameFileSystem extends NodeFileSystem {
  override ensureDirectory(): Promise<void> {
    return Promise.resolve();
  }

  override isSymbolicLink(): Promise<boolean> {
    return Promise.resolve(false);
  }

  override realPath(candidate: string): Promise<string> {
    return Promise.resolve(candidate.replace("RUNNER~1", "runneradmin"));
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("service runtime and automation policy", () => {
  it("resolves platform-specific user runtime directories and endpoints", () => {
    expect(
      resolveServiceRuntimeLocation({
        platform: "win32",
        environment: { LOCALAPPDATA: "C:\\Users\\dev user\\AppData\\Local" },
        homeDirectory: "C:\\Users\\dev user",
      }),
    ).toEqual({
      directory: path.win32.join("C:\\Users\\dev user\\AppData\\Local", "AgentFold", "runtime"),
      endpointKind: "named-pipe",
    });
    expect(
      resolveServiceRuntimeLocation({
        platform: "darwin",
        environment: {},
        homeDirectory: "/Users/dev user",
      }).directory,
    ).toBe(path.posix.join("/Users/dev user", "Library", "Application Support", "AgentFold"));
    expect(
      resolveServiceRuntimeLocation({
        platform: "linux",
        environment: { XDG_RUNTIME_DIR: "/run/user/1000" },
        homeDirectory: "/home/dev",
      }).directory,
    ).toBe(path.posix.join("/run/user/1000", "agentfold"));
    expect(
      resolveServiceRuntimeLocation({
        platform: "linux",
        environment: {},
        homeDirectory: "/home/dev",
      }).directory,
    ).toBe(path.posix.join("/home/dev", ".local", "state", "agentfold"));

    const identifier = safeRuntimeIdentifier("C:\\Users\\secret-name\\runtime");
    expect(identifier).toMatch(/^[0-9a-f]{20}$/u);
    expect(createServiceEndpoint("C:\\runtime", "named-pipe")).toMatch(
      /^\\\\\.\\pipe\\agentfold-[0-9a-f]{20}$/u,
    );
    expect(createServiceEndpoint("/tmp/agent fold ü", "unix-socket")).toContain(".sock");
  });

  it("supports an isolated runtime override containing spaces and Unicode", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentfold runtime ü "));
    temporaryDirectories.push(root);
    const requested = path.join(root, "nested runtime ü");
    const runtime = await prepareServiceRuntimeDirectory({
      fileSystem: new NodeFileSystem(),
      runtimeDirectory: requested,
      platform: { platform: process.platform, environment: {}, homeDirectory: root },
      restrictDirectory: () => Promise.resolve(),
    });
    expect(runtime.realDirectory).toBe(await new NodeFileSystem().realPath(requested));
  });

  it("accepts fixed macOS aliases without accepting nested runtime symlinks", async () => {
    const fileSystem = new DarwinAliasFileSystem();
    await expect(
      prepareServiceRuntimeDirectory({
        fileSystem,
        runtimeDirectory: "/var/folders/agentfold runtime",
        platform: { platform: "darwin", environment: {}, homeDirectory: "/Users/dev" },
        restrictDirectory: () => Promise.resolve(),
      }),
    ).resolves.toMatchObject({ realDirectory: "/private/var/folders/agentfold runtime" });
    await expect(
      prepareServiceRuntimeDirectory({
        fileSystem,
        runtimeDirectory: "/var/folders/escaped/runtime",
        platform: { platform: "darwin", environment: {}, homeDirectory: "/Users/dev" },
        restrictDirectory: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/symbolic link/u);
  });

  it("accepts Windows short-name expansion when every component is not a symlink", async () => {
    const runtime = await prepareServiceRuntimeDirectory({
      fileSystem: new WindowsShortNameFileSystem(),
      runtimeDirectory: "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\agentfold runtime",
      platform: {
        platform: "win32",
        environment: {},
        homeDirectory: "C:\\Users\\runneradmin",
      },
      restrictDirectory: () => Promise.resolve(),
    });
    expect(runtime.realDirectory).toBe(
      "C:\\Users\\runneradmin\\AppData\\Local\\Temp\\agentfold runtime",
    );
  });

  it("generates a 256-bit capability token and compares it safely", () => {
    const token = generateCapabilityToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(capabilityTokensEqual(token, token)).toBe(true);
    expect(capabilityTokensEqual(token, `${token}x`)).toBe(false);
  });

  it("resolves backward-compatible defaults and rejects nonsensical leases", () => {
    expect(resolveAutomationPolicy()).toEqual(defaultAutomationPolicy);
    expect(
      resolveAutomationPolicy({
        sessions: { heartbeat_interval_seconds: 10, stale_after_seconds: 40 },
      }).sessions,
    ).toEqual({ heartbeatIntervalSeconds: 10, staleAfterSeconds: 40 });
    expect(
      automationPolicySchema.safeParse({
        ...defaultAutomationPolicy,
        sessions: { heartbeatIntervalSeconds: 20, staleAfterSeconds: 20 },
      }).success,
    ).toBe(false);

    const legacy = parseConfig({
      version: 1,
      project: { name: "Legacy", summary: "" },
      runtime: { node: ">=20" },
      commands: {},
      state: { visibility: "local" },
      safety: { respect_gitignore: true, excluded_paths: [] },
    });
    expect(legacy.automation).toBeUndefined();
    expect(serializeConfig({ ...legacy, automation: { enabled: false } })).toContain(
      "automation:\n  enabled: false",
    );
    expect(() =>
      parseConfig({
        ...legacy,
        automation: {
          sessions: { heartbeat_interval_seconds: 20, stale_after_seconds: 20 },
        },
      }),
    ).toThrow(/stale_after_seconds/u);
  });
});

describe("service queues and sessions", () => {
  it("serializes one repository, allows another repository, and survives failure", async () => {
    const queue = new RepositoryOperationQueue();
    const events: string[] = [];
    let releaseA: (() => void) | undefined;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const first = queue.run("repo-a", async () => {
      events.push("a1-start");
      await gateA;
      events.push("a1-end");
    });
    const second = queue.run("repo-a", async () => events.push("a2"));
    const other = queue.run("repo-b", async () => events.push("b1"));
    await other;
    expect(events).toEqual(["a1-start", "b1"]);
    releaseA?.();
    await Promise.all([first, second]);
    expect(events).toEqual(["a1-start", "b1", "a1-end", "a2"]);
    await expect(
      queue.run("repo-a", () => Promise.reject(new Error("expected"))),
    ).rejects.toThrow();
    await expect(queue.run("repo-a", () => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("tracks leases, detach, supersede, close, and minimal metadata", () => {
    let now = new Date("2026-07-21T00:00:00.000Z");
    let sequence = 0;
    const sessions = new ServiceSessionRegistry({
      now: () => now,
      generateId: () => `session-${++sequence}`,
    });
    const opened = sessions.open({
      repositoryId: "repo-a",
      client: "antigravity",
      agent: "antigravity",
      target: "antigravity",
      leaseDurationSeconds: 90,
    });
    expect(opened.leaseExpiresAt).toBe("2026-07-21T00:01:30.000Z");
    now = new Date("2026-07-21T00:00:20.000Z");
    expect(sessions.touch(opened.sessionId)?.leaseExpiresAt).toBe("2026-07-21T00:01:50.000Z");
    expect(sessions.detach(opened.sessionId)?.state).toBe("detached");
    expect(JSON.stringify(sessions.all())).not.toMatch(
      /prompt|conversation|transcript|sourceContent/iu,
    );
    expect(sessions.supersede(opened.sessionId)?.closeReason).toBe("agent_switch");
    expect(sessions.requireOpen(opened.sessionId)).toBeUndefined();
  });
});
