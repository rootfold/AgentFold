import { rm } from "node:fs/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runMcpServer, type McpSignalSource } from "../../src/integrations/mcp/run-mcp-server.js";
import { agentFoldMcpToolNames } from "../../src/integrations/mcp/tool-names.js";
import { mcpSuccess } from "../../src/integrations/mcp/mcp-response.js";
import type { AgentFoldServiceClient } from "../../src/integrations/service/service-client.js";
import { createContinuityFixture, StubGitInspector } from "../helpers/continuity-fixture.js";

const temporaryDirectories: string[] = [];

class Signals implements McpSignalSource {
  private readonly listeners = new Map<"SIGINT" | "SIGTERM", Set<() => void>>();
  once(signal: "SIGINT" | "SIGTERM", listener: () => void): void {
    const listeners = this.listeners.get(signal) ?? new Set();
    listeners.add(listener);
    this.listeners.set(signal, listeners);
  }
  off(signal: "SIGINT" | "SIGTERM", listener: () => void): void {
    this.listeners.get(signal)?.delete(listener);
  }
  emit(signal: "SIGINT" | "SIGTERM"): void {
    for (const listener of this.listeners.get(signal) ?? []) listener();
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("MCP shared-service modes", () => {
  it("starts one absent service before required-mode connection without stdout protocol pollution", async () => {
    const fixture = await createContinuityFixture(temporaryDirectories);
    const signals = new Signals();
    const serviceClient = {
      getStatus: () =>
        Promise.resolve(
          mcpSuccess(agentFoldMcpToolNames.getStatus, "auto_started_service", { ready: true }),
        ),
    } as unknown as AgentFoldServiceClient;
    const connected = {
      status: "connected",
      client: serviceClient,
      metadata: {
        schemaVersion: 1,
        protocolVersion: 1,
        serviceVersion: "0.0.0-test",
        pid: 1,
        startedAt: "2026-07-21T00:00:00.000Z",
        endpointKind: process.platform === "win32" ? "named-pipe" : "unix-socket",
        endpoint: "safe",
        token: "x".repeat(43),
      },
      diagnostics: [],
    } as const;
    const connect = vi
      .fn()
      .mockResolvedValueOnce({ status: "unavailable", diagnostics: [] })
      .mockResolvedValue(connected);
    const start = vi.fn(() =>
      Promise.resolve({ status: "started", exitCode: 0, diagnostics: [] } as const),
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const running = runMcpServer({
      workspace: fixture.root,
      version: "0.0.0-test",
      fileSystem: fixture.fileSystem,
      gitRepositoryLocator: fixture.gitRepositoryLocator,
      gitInspector: new StubGitInspector(undefined, true),
      logger: { debug: () => undefined, error: () => undefined },
      serviceMode: "required",
      ensureService: true,
      connectServiceClient: connect as never,
      startService: start as never,
      signalSource: signals,
      transport: serverTransport,
    });
    const client = new Client({ name: "ensure-test", version: "1.0.0" });
    await client.connect(clientTransport);
    const status = await client.callTool({ name: agentFoldMcpToolNames.getStatus, arguments: {} });
    expect(status.structuredContent).toMatchObject({ status: "auto_started_service" });
    expect(start).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(2);
    signals.emit("SIGTERM");
    await expect(running).resolves.toBe(0);
    await client.close();
  });

  it("does not start a duplicate service and rejects disabled ensure-service mode", async () => {
    const fixture = await createContinuityFixture(temporaryDirectories);
    const start = vi.fn();
    const disabled = await runMcpServer({
      workspace: fixture.root,
      version: "0.0.0-test",
      fileSystem: fixture.fileSystem,
      gitRepositoryLocator: fixture.gitRepositoryLocator,
      gitInspector: new StubGitInspector(undefined, true),
      logger: { debug: () => undefined, error: () => undefined },
      serviceMode: "disabled",
      ensureService: true,
      startService: start as never,
    });
    expect(disabled).toBe(2);
    expect(start).not.toHaveBeenCalled();
  });

  it("reuses an already-running service without attempting a duplicate start", async () => {
    const fixture = await createContinuityFixture(temporaryDirectories);
    const signals = new Signals();
    const start = vi.fn();
    const serviceClient = {
      getStatus: () =>
        Promise.resolve(mcpSuccess(agentFoldMcpToolNames.getStatus, "existing_service", {})),
    } as unknown as AgentFoldServiceClient;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const running = runMcpServer({
      workspace: fixture.root,
      version: "0.0.0-test",
      fileSystem: fixture.fileSystem,
      gitRepositoryLocator: fixture.gitRepositoryLocator,
      gitInspector: new StubGitInspector(undefined, true),
      logger: { debug: () => undefined, error: () => undefined },
      serviceMode: "required",
      ensureService: true,
      connectServiceClient: (() =>
        Promise.resolve({
          status: "connected",
          client: serviceClient,
          metadata: {
            schemaVersion: 1,
            protocolVersion: 1,
            serviceVersion: "0.0.0-test",
            pid: 1,
            startedAt: "2026-07-21T00:00:00.000Z",
            endpointKind: process.platform === "win32" ? "named-pipe" : "unix-socket",
            endpoint: "safe",
            token: "x".repeat(43),
          },
          diagnostics: [],
        })) as never,
      startService: start as never,
      signalSource: signals,
      transport: serverTransport,
    });
    const client = new Client({ name: "existing-service-test", version: "1.0.0" });
    await client.connect(clientTransport);
    expect(
      (await client.callTool({ name: agentFoldMcpToolNames.getStatus, arguments: {} }))
        .structuredContent,
    ).toMatchObject({ status: "existing_service" });
    expect(start).not.toHaveBeenCalled();
    signals.emit("SIGTERM");
    await expect(running).resolves.toBe(0);
    await client.close();
  });

  it("rejects incompatible services and required-mode startup failures without fallback", async () => {
    const fixture = await createContinuityFixture(temporaryDirectories);
    const start = vi.fn();
    const incompatible = await runMcpServer({
      workspace: fixture.root,
      version: "0.0.0-test",
      fileSystem: fixture.fileSystem,
      gitRepositoryLocator: fixture.gitRepositoryLocator,
      gitInspector: new StubGitInspector(undefined, true),
      logger: { debug: () => undefined, error: () => undefined },
      serviceMode: "required",
      ensureService: true,
      connectServiceClient: (() =>
        Promise.resolve({
          status: "incompatible",
          diagnostics: [{ code: "AFSV010", severity: "error", message: "Incompatible" }],
        })) as never,
      startService: start as never,
    });
    expect(incompatible).toBe(1);
    expect(start).not.toHaveBeenCalled();

    const errors: string[] = [];
    const unavailable = vi.fn(() =>
      Promise.resolve({ status: "unavailable", diagnostics: [] as const } as const),
    );
    const failedStart = vi.fn(() =>
      Promise.resolve({
        status: "unavailable",
        exitCode: 1,
        diagnostics: [{ code: "AFSV003", severity: "error", message: "Startup timed out" }],
      } as const),
    );
    const failed = await runMcpServer({
      workspace: fixture.root,
      version: "0.0.0-test",
      fileSystem: fixture.fileSystem,
      gitRepositoryLocator: fixture.gitRepositoryLocator,
      gitInspector: new StubGitInspector(undefined, true),
      logger: { debug: () => undefined, error: (message) => errors.push(message) },
      serviceMode: "required",
      ensureService: true,
      connectServiceClient: unavailable as never,
      startService: failedStart as never,
    });
    expect(failed).toBe(1);
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(failedStart).toHaveBeenCalledTimes(1);
    expect(errors.join("\n")).toContain("Startup timed out");
    expect(errors.join("\n")).toContain("AFSV032");
  });

  it("fails required mode safely when the service is unavailable", async () => {
    const fixture = await createContinuityFixture(temporaryDirectories);
    const errors: string[] = [];
    const result = await runMcpServer({
      workspace: fixture.root,
      version: "0.0.0-test",
      fileSystem: fixture.fileSystem,
      gitRepositoryLocator: fixture.gitRepositoryLocator,
      gitInspector: new StubGitInspector(undefined, true),
      logger: { debug: () => undefined, error: (message) => errors.push(message) },
      serviceMode: "required",
      connectServiceClient: (() =>
        Promise.resolve({
          status: "unavailable",
          diagnostics: [{ code: "AFSV004", severity: "info", message: "Not running" }],
        })) as never,
    });
    expect(result).toBe(1);
    expect(errors.join("\n")).toContain("AFSV032");
  });

  it("uses startup-only auto fallback and keeps embedded tools available", async () => {
    const fixture = await createContinuityFixture(temporaryDirectories);
    const signals = new Signals();
    const errors: string[] = [];
    const connect = vi.fn(() =>
      Promise.resolve({ status: "unavailable", diagnostics: [] as const } as const),
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const running = runMcpServer({
      workspace: fixture.root,
      version: "0.0.0-test",
      fileSystem: fixture.fileSystem,
      gitRepositoryLocator: fixture.gitRepositoryLocator,
      gitInspector: new StubGitInspector(undefined, true),
      logger: { debug: () => undefined, error: (message) => errors.push(message) },
      serviceMode: "auto",
      connectServiceClient: connect as never,
      signalSource: signals,
      transport: serverTransport,
    });
    const client = new Client({ name: "auto-test", version: "1.0.0" });
    await client.connect(clientTransport);
    const status = await client.callTool({ name: agentFoldMcpToolNames.getStatus, arguments: {} });
    expect(status.isError).not.toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(errors.join("\n")).toContain("AFSV031");
    signals.emit("SIGTERM");
    await expect(running).resolves.toBe(0);
    await client.close();
  });

  it("delegates tools to a connected service and does not fall back after a call failure", async () => {
    const fixture = await createContinuityFixture(temporaryDirectories);
    const signals = new Signals();
    let fail = false;
    const serviceClient = {
      getStatus: () =>
        fail
          ? Promise.reject(new Error("disconnected"))
          : Promise.resolve(
              mcpSuccess(agentFoldMcpToolNames.getStatus, "service_marker", { delegated: true }),
            ),
    } as unknown as AgentFoldServiceClient;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const running = runMcpServer({
      workspace: fixture.root,
      version: "0.0.0-test",
      fileSystem: fixture.fileSystem,
      gitRepositoryLocator: fixture.gitRepositoryLocator,
      gitInspector: new StubGitInspector(undefined, true),
      logger: { debug: () => undefined, error: () => undefined },
      serviceMode: "required",
      connectServiceClient: (() =>
        Promise.resolve({
          status: "connected",
          client: serviceClient,
          metadata: {
            schemaVersion: 1,
            protocolVersion: 1,
            serviceVersion: "0.0.0-test",
            pid: 1,
            startedAt: "2026-07-21T00:00:00.000Z",
            endpointKind: process.platform === "win32" ? "named-pipe" : "unix-socket",
            endpoint: "safe",
            token: "x".repeat(43),
          },
          diagnostics: [],
        })) as never,
      signalSource: signals,
      transport: serverTransport,
    });
    const client = new Client({ name: "required-test", version: "1.0.0" });
    await client.connect(clientTransport);
    const delegated = await client.callTool({
      name: agentFoldMcpToolNames.getStatus,
      arguments: {},
    });
    expect(delegated.structuredContent).toMatchObject({ status: "service_marker" });
    fail = true;
    const unavailable = await client.callTool({
      name: agentFoldMcpToolNames.getStatus,
      arguments: {},
    });
    expect(unavailable.isError).toBe(true);
    expect(unavailable.structuredContent).toMatchObject({ status: "service_unavailable" });
    signals.emit("SIGINT");
    await expect(running).resolves.toBe(0);
    await client.close();
  });
});
