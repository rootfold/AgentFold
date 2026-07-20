import type { ResumeTarget } from "../../core/resume/types.js";

export type ServiceEndpointKind = "named-pipe" | "unix-socket";

export type AgentFoldServiceSessionState =
  "open" | "detached" | "superseded" | "recovery_pending" | "closed";

export type AgentFoldServiceSessionCloseReason =
  "normal" | "agent_switch" | "heartbeat_timeout" | "client_disconnect";

export interface AgentFoldServiceSession {
  readonly sessionId: string;
  readonly repositoryId: string;
  readonly client: string;
  readonly agent: string;
  readonly target: ResumeTarget;
  readonly openedAt: string;
  readonly lastHeartbeatAt: string;
  readonly leaseExpiresAt: string;
  readonly activeTaskId?: string;
  readonly state: AgentFoldServiceSessionState;
  readonly closedAt?: string;
  readonly closeReason?: AgentFoldServiceSessionCloseReason;
}

export interface SafeAgentFoldServiceStatus {
  readonly running: boolean;
  readonly serviceVersion?: string;
  readonly processId?: number;
  readonly startedAt?: string;
  readonly endpointKind?: ServiceEndpointKind;
  readonly registeredRepositoryCount: number;
  readonly openSessionCount: number;
  readonly staleOrRecoveryPendingSessionCount: number;
  readonly automationEnabled: boolean;
}
