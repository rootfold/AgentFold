import { z } from "zod";

import {
  defaultAutomationPolicy,
  type AutomationPolicy,
} from "../../core/config/automation-policy.js";
import { loadCanonicalContext } from "../../core/context/load-context.js";
import type { Diagnostic } from "../../core/diagnostics/diagnostic.js";
import type { FileSystem } from "../../core/filesystem/filesystem.js";
import type { GitInspector } from "../../core/git/git-inspector.js";
import type { GitRepositoryLocator } from "../../core/git/git-repository-locator.js";
import type { ResumeTarget } from "../../core/resume/types.js";
import { createAgentFoldIntegrationOperations } from "../application/integration-operations.js";
import { createMcpStderrLogger, type McpStderrLogger } from "../mcp/mcp-context.js";
import { mcpFailure, type AgentFoldMcpResult } from "../mcp/mcp-response.js";
import { containsSecretLikeText } from "../../core/reports/redact-secrets.js";
import {
  beginTaskInputSchema,
  closeSessionInputSchema,
  createCheckpointInputSchema,
  finishTaskInputSchema,
  getContextInputSchema,
  getResumePacketInputSchema,
  getStatusInputSchema,
  openSessionInputSchema,
  reportProgressInputSchema,
} from "../mcp/tool-schemas.js";
import { createAutomaticCheckpoint } from "./automation-checkpoint.js";
import { RepositoryOperationQueue } from "./operation-queue.js";
import { RepositoryRegistry, type RegisteredRepository } from "./repository-registry.js";
import { ServiceSessionRegistry } from "./session-registry.js";
import { agentFoldServiceProtocolVersion, type ServiceMethodName } from "./service-protocol.js";
import type { SafeAgentFoldServiceStatus } from "./service-types.js";

const workspaceSchema = z.string().trim().min(1).max(32_768);
const sessionIdSchema = z.string().trim().min(1).max(200);
const emptySchema = z.object({}).strict();
const sessionOpenSchema = openSessionInputSchema.extend({ workspace: workspaceSchema });
const workspaceStatusSchema = getStatusInputSchema.extend({ workspace: workspaceSchema });
const workspaceContextSchema = getContextInputSchema.extend({ workspace: workspaceSchema });
const sessionLifecycleSchema = z.object({ sessionId: sessionIdSchema }).strict();

export interface ServiceCoordinatorOptions {
  readonly version: string;
  readonly startedAt: string;
  readonly processId: number;
  readonly endpointKind: "named-pipe" | "unix-socket";
  readonly fileSystem: FileSystem;
  readonly gitRepositoryLocator: GitRepositoryLocator;
  readonly gitInspector: GitInspector;
  readonly now?: () => Date;
  readonly generateSessionId?: () => string;
  readonly logger?: McpStderrLogger;
  readonly onShutdownRequested?: () => void;
}

export class ServiceMethodError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly diagnostics: readonly Diagnostic[] = [],
  ) {
    super(message);
    this.name = "ServiceMethodError";
  }
}

function invalidParams(error: z.ZodError): ServiceMethodError {
  return new ServiceMethodError("AFSV011", "The service method parameters are invalid.", [
    {
      code: "AFSV011",
      severity: "error",
      message: "The service method parameters did not match the required schema.",
      suggestion: error.issues
        .map((issue) => `${issue.path.join(".") || "params"}: ${issue.message}`)
        .join("; "),
    },
  ]);
}

function parseParams<Schema extends z.ZodType>(schema: Schema, input: unknown): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw invalidParams(parsed.error);
  return parsed.data;
}

function diagnostic(
  code: string,
  severity: Diagnostic["severity"],
  message: string,
  suggestion?: string,
): Diagnostic {
  return { code, severity, message, ...(suggestion === undefined ? {} : { suggestion }) };
}

export class AgentFoldServiceCoordinator {
  readonly repositories: RepositoryRegistry;
  readonly sessions: ServiceSessionRegistry;
  readonly queue = new RepositoryOperationQueue();
  private readonly now: () => Date;
  private readonly logger: McpStderrLogger;
  private readonly policies = new Map<string, AutomationPolicy>();

  constructor(private readonly options: ServiceCoordinatorOptions) {
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? createMcpStderrLogger(() => undefined, false);
    this.repositories = new RepositoryRegistry({
      fileSystem: options.fileSystem,
      gitRepositoryLocator: options.gitRepositoryLocator,
      now: this.now,
    });
    this.sessions = new ServiceSessionRegistry({
      now: this.now,
      ...(options.generateSessionId === undefined ? {} : { generateId: options.generateSessionId }),
    });
  }

  private async policy(repository: RegisteredRepository): Promise<AutomationPolicy> {
    const existing = this.policies.get(repository.repositoryId);
    if (existing !== undefined) return existing;
    const loaded = await loadCanonicalContext({
      fileSystem: this.options.fileSystem,
      gitRepositoryLocator: this.options.gitRepositoryLocator,
      startDirectory: repository.absoluteRoot,
    });
    const policy =
      loaded.status === "success" ? loaded.context.automation : defaultAutomationPolicy;
    this.policies.set(repository.repositoryId, policy);
    return policy;
  }

  private context(
    repository: RegisteredRepository,
    target: ResumeTarget,
    policy: AutomationPolicy,
  ) {
    return {
      requestedWorkspace: repository.absoluteRoot,
      repositoryRoot: repository.absoluteRoot,
      version: this.options.version,
      fileSystem: this.options.fileSystem,
      gitRepositoryLocator: this.options.gitRepositoryLocator,
      gitInspector: this.options.gitInspector,
      now: this.now,
      sessions: this.sessions.mcpAdapter(
        repository.repositoryId,
        target,
        policy.sessions.staleAfterSeconds,
      ),
      debug: false,
      logger: this.logger,
    };
  }

  private async repositoryForSession(sessionId: string): Promise<{
    readonly repository: RegisteredRepository;
    readonly policy: AutomationPolicy;
    readonly target: ResumeTarget;
  }> {
    const session = this.sessions.get(sessionId);
    if (session === undefined)
      throw new ServiceMethodError("AFSV015", "The service session is unknown.");
    const repository = this.repositories.get(session.repositoryId);
    if (repository === undefined)
      throw new ServiceMethodError("AFSV016", "The session repository is unavailable.");
    return { repository, policy: await this.policy(repository), target: session.target };
  }

  private status(): SafeAgentFoldServiceStatus {
    const sessions = this.sessions.all();
    const now = this.now().getTime();
    return {
      running: true,
      serviceVersion: this.options.version,
      processId: this.options.processId,
      startedAt: this.options.startedAt,
      endpointKind: this.options.endpointKind,
      registeredRepositoryCount: this.repositories.count(),
      openSessionCount: sessions.filter((session) => session.state === "open").length,
      staleOrRecoveryPendingSessionCount: sessions.filter(
        (session) =>
          session.state === "recovery_pending" ||
          ((session.state === "open" || session.state === "detached") &&
            Date.parse(session.leaseExpiresAt) <= now),
      ).length,
      automationEnabled:
        this.policies.size === 0 || [...this.policies.values()].some((policy) => policy.enabled),
    };
  }

  async handle(method: ServiceMethodName, params: unknown): Promise<unknown> {
    switch (method) {
      case "service.ping": {
        parseParams(emptySchema, params);
        return {
          protocolVersion: agentFoldServiceProtocolVersion,
          serviceVersion: this.options.version,
          status: "ready",
          endpointKind: this.options.endpointKind,
        };
      }
      case "service.status":
        parseParams(emptySchema, params);
        return this.status();
      case "service.shutdown":
        parseParams(emptySchema, params);
        this.options.onShutdownRequested?.();
        return { status: "stopping" };
      case "session.open":
        return this.openSession(params);
      case "session.heartbeat":
        return this.heartbeat(params);
      case "session.detach":
        return this.detach(params);
      case "session.close":
        return this.closeSession(params);
      case "integration.get_status":
        return this.getStatus(params);
      case "integration.get_context":
        return this.getContext(params);
      case "integration.begin_task":
        return this.sessionOperation(params, beginTaskInputSchema, "beginTask", true);
      case "integration.report_progress":
        return this.sessionOperation(params, reportProgressInputSchema, "reportProgress", true);
      case "integration.create_checkpoint":
        return this.sessionOperation(params, createCheckpointInputSchema, "createCheckpoint", true);
      case "integration.finish_task":
        return this.sessionOperation(params, finishTaskInputSchema, "finishTask", true);
      case "integration.get_resume_packet":
        return this.sessionOperation(params, getResumePacketInputSchema, "getResumePacket", false);
    }
  }

  private async getStatus(params: unknown): Promise<AgentFoldMcpResult> {
    const parsed = parseParams(workspaceStatusSchema, params);
    const repository = await this.repositories.register(parsed.workspace);
    const policy = await this.policy(repository);
    return createAgentFoldIntegrationOperations(
      this.context(repository, "generic", policy),
    ).getStatus({});
  }

  private async getContext(params: unknown): Promise<AgentFoldMcpResult> {
    const parsed = parseParams(workspaceContextSchema, params);
    const repository = await this.repositories.register(parsed.workspace);
    const policy = await this.policy(repository);
    return createAgentFoldIntegrationOperations(
      this.context(repository, "generic", policy),
    ).getContext({
      includeContextDocuments: parsed.includeContextDocuments,
    });
  }

  private async openSession(params: unknown): Promise<AgentFoldMcpResult> {
    const parsed = parseParams(sessionOpenSchema, params);
    const repository = await this.repositories.register(parsed.workspace);
    const policy = await this.policy(repository);
    return this.queue.run(repository.repositoryId, async () => {
      const previous = this.sessions.freshActive(repository.repositoryId);
      const automationDiagnostics: Diagnostic[] = [];
      let switchFailed = false;
      if (
        previous !== undefined &&
        previous.agent !== parsed.agent &&
        policy.enabled &&
        policy.checkpoints.onAgentSwitch
      ) {
        automationDiagnostics.push(
          diagnostic(
            "AFSV019",
            "info",
            "A different active agent was detected for this repository.",
          ),
        );
        const automatic = await createAutomaticCheckpoint({
          repositoryRoot: repository.absoluteRoot,
          agent: previous.agent,
          policy,
          trigger: "agent_switch",
          fileSystem: this.options.fileSystem,
          gitRepositoryLocator: this.options.gitRepositoryLocator,
          gitInspector: this.options.gitInspector,
          now: this.now,
        });
        automationDiagnostics.push(...automatic.diagnostics);
        if (automatic.status === "failed") {
          switchFailed = true;
          automationDiagnostics.push(
            diagnostic(
              "AFSV025",
              "warning",
              "The agent-switch checkpoint failed; the latest prior checkpoint may be stale.",
            ),
          );
        } else {
          this.sessions.supersede(previous.sessionId);
          this.repositories.detachSession(repository.repositoryId, previous.sessionId);
        }
      }
      const result = await createAgentFoldIntegrationOperations(
        this.context(repository, parsed.target, policy),
      ).openSession({
        client: parsed.client,
        agent: parsed.agent,
        target: parsed.target,
        resumeFormat: parsed.resumeFormat,
      });
      const sessionId =
        typeof result.data === "object" && result.data !== null && "sessionId" in result.data
          ? result.data.sessionId
          : undefined;
      if (typeof sessionId === "string")
        this.repositories.attachSession(repository.repositoryId, sessionId);
      const openedSession =
        typeof sessionId === "string" ? this.sessions.get(sessionId) : undefined;
      const data =
        typeof result.data === "object" && result.data !== null
          ? {
              ...result.data,
              heartbeatIntervalSeconds: policy.sessions.heartbeatIntervalSeconds,
              ...(openedSession === undefined
                ? {}
                : {
                    leaseExpiresAt: openedSession.leaseExpiresAt,
                    repositoryId: repository.repositoryId,
                  }),
            }
          : result.data;
      return {
        ...result,
        ...(data === undefined ? {} : { data }),
        ...(switchFailed && result.ok ? { status: "partial_success" } : {}),
        diagnostics: [...result.diagnostics, ...automationDiagnostics],
      };
    });
  }

  private async heartbeat(params: unknown): Promise<unknown> {
    const parsed = parseParams(sessionLifecycleSchema, params);
    const session = this.sessions.touch(parsed.sessionId);
    if (session === undefined)
      throw new ServiceMethodError("AFSV015", "The service session is not open.");
    return {
      sessionId: session.sessionId,
      leaseExpiresAt: session.leaseExpiresAt,
      status: "heartbeat_accepted",
    };
  }

  private detach(params: unknown): unknown {
    const parsed = parseParams(sessionLifecycleSchema, params);
    const session = this.sessions.detach(parsed.sessionId);
    if (session === undefined)
      throw new ServiceMethodError("AFSV015", "The service session is not open.");
    return {
      sessionId: session.sessionId,
      state: session.state,
      leaseExpiresAt: session.leaseExpiresAt,
    };
  }

  private async closeSession(params: unknown): Promise<AgentFoldMcpResult> {
    const parsed = parseParams(closeSessionInputSchema, params);
    const located = await this.repositoryForSession(parsed.sessionId);
    return this.queue.run(located.repository.repositoryId, async () => {
      const result = await createAgentFoldIntegrationOperations(
        this.context(located.repository, located.target, located.policy),
      ).closeSession(parsed);
      if (result.ok)
        this.repositories.detachSession(located.repository.repositoryId, parsed.sessionId);
      return result;
    });
  }

  private async sessionOperation<Schema extends z.ZodType>(
    params: unknown,
    schema: Schema,
    operation:
      "beginTask" | "reportProgress" | "createCheckpoint" | "finishTask" | "getResumePacket",
    serialized: boolean,
  ): Promise<AgentFoldMcpResult> {
    const parsed = parseParams(schema, params) as z.output<Schema> & { readonly sessionId: string };
    const located = await this.repositoryForSession(parsed.sessionId);
    const invoke = async (): Promise<AgentFoldMcpResult> => {
      const operations = createAgentFoldIntegrationOperations(
        this.context(located.repository, located.target, located.policy),
      );
      const handler = operations[operation] as (input: unknown) => Promise<AgentFoldMcpResult>;
      return handler(parsed);
    };
    return serialized ? this.queue.run(located.repository.repositoryId, invoke) : invoke();
  }

  async recoverStaleSessions(): Promise<void> {
    for (const stale of this.sessions.staleSessions()) {
      const repository = this.repositories.get(stale.repositoryId);
      if (repository === undefined) continue;
      await this.queue.run(repository.repositoryId, async () => {
        const current = this.sessions.get(stale.sessionId);
        if (
          current === undefined ||
          !["open", "detached", "recovery_pending"].includes(current.state) ||
          Date.parse(current.leaseExpiresAt) > this.now().getTime()
        ) {
          return;
        }
        const policy = await this.policy(repository);
        this.sessions.markRecoveryPending(current.sessionId);
        if (!policy.enabled || !policy.checkpoints.recoveryOnTimeout) {
          this.sessions.close(current.sessionId, "heartbeat_timeout");
          this.repositories.detachSession(repository.repositoryId, current.sessionId);
          return;
        }
        const automatic = await createAutomaticCheckpoint({
          repositoryRoot: repository.absoluteRoot,
          agent: current.agent,
          policy,
          trigger: "heartbeat_timeout",
          fileSystem: this.options.fileSystem,
          gitRepositoryLocator: this.options.gitRepositoryLocator,
          gitInspector: this.options.gitInspector,
          now: this.now,
        });
        if (automatic.status === "failed") {
          this.sessions.markRecoveryPending(current.sessionId, policy.sessions.staleAfterSeconds);
          this.logger.error("AFSV026: Stale-session recovery failed and was deferred safely.");
          return;
        }
        this.sessions.close(current.sessionId, "heartbeat_timeout");
        this.repositories.detachSession(repository.repositoryId, current.sessionId);
      });
    }
  }

  unavailableResult(operation: string, message: string): AgentFoldMcpResult {
    return mcpFailure(operation, "service_unavailable", [
      diagnostic("AFSV014", "error", message, "Restart agentfold service and retry."),
    ]);
  }

  sanitizeResult(value: unknown): unknown {
    const roots = this.repositories.all().map((repository) => repository.absoluteRoot);
    const sanitize = (candidate: unknown): unknown => {
      if (typeof candidate === "string") {
        return roots.reduce(
          (current, root) =>
            current.replaceAll(root, ".").replaceAll(root.replaceAll("\\", "/"), "."),
          candidate,
        );
      }
      if (Array.isArray(candidate)) return candidate.map(sanitize);
      if (typeof candidate === "object" && candidate !== null) {
        return Object.fromEntries(
          Object.entries(candidate).map(([key, item]) => [key, sanitize(item)]),
        );
      }
      return candidate;
    };
    const sanitized = sanitize(value);
    if (containsSecretLikeText(JSON.stringify(sanitized))) {
      throw new ServiceMethodError(
        "AFSV027",
        "A secret-like value was withheld from the service response.",
      );
    }
    return sanitized;
  }
}
