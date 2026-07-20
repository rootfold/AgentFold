import process from "node:process";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { FileSystem } from "../../core/filesystem/filesystem.js";
import type { GitInspector } from "../../core/git/git-inspector.js";
import type { GitRepositoryLocator } from "../../core/git/git-repository-locator.js";
import { createAgentFoldMcpServer } from "./create-mcp-server.js";
import { createMcpApplicationContext, type McpStderrLogger } from "./mcp-context.js";
import { InMemorySessionRegistry } from "./session-registry.js";
import { connectAgentFoldServiceClient } from "../service/service-client.js";
import type { ServiceMode } from "../service/service-mode.js";
import { createMcpServiceBridge } from "./service-bridge.js";

type ShutdownSignal = "SIGINT" | "SIGTERM";

export interface McpSignalSource {
  once(signal: ShutdownSignal, listener: () => void): void;
  off(signal: ShutdownSignal, listener: () => void): void;
}

export interface RunMcpServerInput {
  readonly workspace?: string;
  readonly debug?: boolean;
  readonly version: string;
  readonly fileSystem: FileSystem;
  readonly gitRepositoryLocator: GitRepositoryLocator;
  readonly gitInspector: GitInspector;
  readonly logger: McpStderrLogger;
  readonly now?: () => Date;
  readonly generateSessionId?: () => string;
  readonly signalSource?: McpSignalSource;
  readonly transport?: Transport;
  readonly serviceMode?: ServiceMode;
  readonly runtimeDirectory?: string;
  readonly connectServiceClient?: typeof connectAgentFoldServiceClient;
}

export async function runMcpServer(input: RunMcpServerInput): Promise<number> {
  const now = input.now ?? (() => new Date());
  const sessions = new InMemorySessionRegistry({
    now,
    ...(input.generateSessionId === undefined ? {} : { generateId: input.generateSessionId }),
  });
  const resolved = await createMcpApplicationContext({
    ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
    version: input.version,
    fileSystem: input.fileSystem,
    gitRepositoryLocator: input.gitRepositoryLocator,
    gitInspector: input.gitInspector,
    sessions,
    now,
    debug: input.debug ?? false,
    logger: input.logger,
  });
  if (resolved.status === "error") {
    for (const diagnostic of resolved.diagnostics) {
      input.logger.error(`${diagnostic.code}: ${diagnostic.message}`);
    }
    return 6;
  }

  const serviceMode = input.serviceMode ?? "auto";
  let bridge: ReturnType<typeof createMcpServiceBridge> | undefined;
  if (serviceMode !== "disabled") {
    const connected = await (input.connectServiceClient ?? connectAgentFoldServiceClient)({
      fileSystem: input.fileSystem,
      clientVersion: input.version,
      ...(input.runtimeDirectory === undefined ? {} : { runtimeDirectory: input.runtimeDirectory }),
    });
    if (connected.status === "connected") {
      for (const diagnostic of connected.diagnostics) {
        input.logger.error(`${diagnostic.code}: ${diagnostic.message}`);
      }
      bridge = createMcpServiceBridge({
        workspace: resolved.context.repositoryRoot,
        client: connected.client,
        logger: input.logger,
      });
      input.logger.debug("MCP tools are delegated to the shared AgentFold service.");
    } else if (serviceMode === "required") {
      for (const diagnostic of connected.diagnostics) {
        input.logger.error(`${diagnostic.code}: ${diagnostic.message}`);
      }
      input.logger.error("AFSV032: The required shared AgentFold service is unavailable.");
      return 1;
    } else {
      input.logger.error(
        "AFSV031: Shared AgentFold service unavailable; using embedded mode without cross-application automation.",
      );
    }
  }

  const server = createAgentFoldMcpServer({
    context: resolved.context,
    ...(bridge === undefined ? {} : { handlers: bridge.handlers }),
  });
  const transport = input.transport ?? new StdioServerTransport();
  const signalSource = input.signalSource ?? process;
  let shuttingDown = false;
  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  server.server.onclose = () => {
    if (bridge === undefined) {
      resolveClosed?.();
      return;
    }
    void bridge.shutdown().finally(() => resolveClosed?.());
  };
  server.server.onerror = (error) => {
    input.logger.debug(`Transport warning: ${error.message}`);
  };
  const shutdown = async (reason: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    input.logger.debug(`Shutting down after ${reason}.`);
    try {
      await bridge?.shutdown();
      await server.close();
    } catch {
      input.logger.error("AFMCP015: MCP shutdown did not complete cleanly.");
      resolveClosed?.();
    }
  };
  const onSigint = (): void => void shutdown("SIGINT");
  const onSigterm = (): void => void shutdown("SIGTERM");
  signalSource.once("SIGINT", onSigint);
  signalSource.once("SIGTERM", onSigterm);

  try {
    await server.connect(transport);
    input.logger.debug("MCP stdio server started.");
    await closed;
    return 0;
  } catch {
    input.logger.error("AFMCP001: MCP stdio server failed to start safely.");
    await shutdown("startup failure");
    return 1;
  } finally {
    signalSource.off("SIGINT", onSigint);
    signalSource.off("SIGTERM", onSigterm);
  }
}
