import { randomUUID } from "node:crypto";

export interface AgentFoldMcpSession {
  readonly sessionId: string;
  readonly client: string;
  readonly agent: string;
  readonly openedAt: string;
  readonly lastActivityAt: string;
  readonly activeTaskId?: string;
  readonly closedAt?: string;
}

export type SessionLookupResult =
  | { readonly status: "open"; readonly session: AgentFoldMcpSession }
  | { readonly status: "unknown" | "closed"; readonly session?: AgentFoldMcpSession };

export interface AgentFoldMcpSessionRegistry {
  open(client: string, agent: string): AgentFoldMcpSession;
  requireOpen(sessionId: string): SessionLookupResult;
  attachTask(sessionId: string, taskId: string): AgentFoldMcpSession | undefined;
  touch(sessionId: string): AgentFoldMcpSession | undefined;
  close(sessionId: string): AgentFoldMcpSession | undefined;
  get(sessionId: string): AgentFoldMcpSession | undefined;
}

export interface InMemorySessionRegistryOptions {
  readonly now?: () => Date;
  readonly generateId?: () => string;
}

export class InMemorySessionRegistry implements AgentFoldMcpSessionRegistry {
  private readonly sessions = new Map<string, AgentFoldMcpSession>();
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(options: InMemorySessionRegistryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => `mcp-${randomUUID()}`);
  }

  open(client: string, agent: string): AgentFoldMcpSession {
    let sessionId: string | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = this.generateId();
      if (candidate.length > 0 && !this.sessions.has(candidate)) {
        sessionId = candidate;
        break;
      }
    }
    if (sessionId === undefined) {
      throw new Error("Could not allocate a unique MCP session identifier.");
    }
    const timestamp = this.now().toISOString();
    const session = { sessionId, client, agent, openedAt: timestamp, lastActivityAt: timestamp };
    this.sessions.set(sessionId, session);
    return session;
  }

  requireOpen(sessionId: string): SessionLookupResult {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return { status: "unknown" };
    if (session.closedAt !== undefined) return { status: "closed", session };
    return { status: "open", session };
  }

  attachTask(sessionId: string, taskId: string): AgentFoldMcpSession | undefined {
    return this.updateOpen(sessionId, { activeTaskId: taskId });
  }

  touch(sessionId: string): AgentFoldMcpSession | undefined {
    return this.updateOpen(sessionId, {});
  }

  close(sessionId: string): AgentFoldMcpSession | undefined {
    const current = this.sessions.get(sessionId);
    if (current === undefined || current.closedAt !== undefined) return undefined;
    const timestamp = this.now().toISOString();
    const updated = { ...current, lastActivityAt: timestamp, closedAt: timestamp };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  get(sessionId: string): AgentFoldMcpSession | undefined {
    return this.sessions.get(sessionId);
  }

  private updateOpen(
    sessionId: string,
    changes: { readonly activeTaskId?: string },
  ): AgentFoldMcpSession | undefined {
    const current = this.sessions.get(sessionId);
    if (current === undefined || current.closedAt !== undefined) return undefined;
    const updated = { ...current, ...changes, lastActivityAt: this.now().toISOString() };
    this.sessions.set(sessionId, updated);
    return updated;
  }
}
