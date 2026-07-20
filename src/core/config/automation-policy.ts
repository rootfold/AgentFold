import { z } from "zod";

const heartbeatIntervalSecondsSchema = z.number().int().min(5).max(300);
const staleAfterSecondsSchema = z.number().int().min(6).max(3_600);
const minimumCheckpointIntervalSecondsSchema = z.number().int().min(0).max(3_600);

export const automationConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    sessions: z
      .object({
        heartbeat_interval_seconds: heartbeatIntervalSecondsSchema.optional(),
        stale_after_seconds: staleAfterSecondsSchema.optional(),
      })
      .strict()
      .optional(),
    checkpoints: z
      .object({
        on_agent_switch: z.boolean().optional(),
        on_session_close: z.boolean().optional(),
        recovery_on_timeout: z.boolean().optional(),
        minimum_interval_seconds: minimumCheckpointIntervalSecondsSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const heartbeat = value.sessions?.heartbeat_interval_seconds ?? 20;
    const stale = value.sessions?.stale_after_seconds ?? 90;
    if (stale <= heartbeat) {
      context.addIssue({
        code: "custom",
        path: ["sessions", "stale_after_seconds"],
        message: "Must be greater than heartbeat_interval_seconds",
      });
    }
  });

export const automationPolicySchema = z
  .object({
    enabled: z.boolean(),
    sessions: z
      .object({
        heartbeatIntervalSeconds: heartbeatIntervalSecondsSchema,
        staleAfterSeconds: staleAfterSecondsSchema,
      })
      .strict(),
    checkpoints: z
      .object({
        onAgentSwitch: z.boolean(),
        onSessionClose: z.boolean(),
        recoveryOnTimeout: z.boolean(),
        minimumIntervalSeconds: minimumCheckpointIntervalSecondsSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sessions.staleAfterSeconds <= value.sessions.heartbeatIntervalSeconds) {
      context.addIssue({
        code: "custom",
        path: ["sessions", "staleAfterSeconds"],
        message: "Must be greater than heartbeatIntervalSeconds",
      });
    }
  });

export type AutomationConfig = z.infer<typeof automationConfigSchema>;
export type AutomationPolicy = z.infer<typeof automationPolicySchema>;

export const defaultAutomationPolicy: AutomationPolicy = {
  enabled: true,
  sessions: {
    heartbeatIntervalSeconds: 20,
    staleAfterSeconds: 90,
  },
  checkpoints: {
    onAgentSwitch: true,
    onSessionClose: true,
    recoveryOnTimeout: true,
    minimumIntervalSeconds: 30,
  },
};

export function resolveAutomationPolicy(config?: AutomationConfig): AutomationPolicy {
  return automationPolicySchema.parse({
    enabled: config?.enabled ?? defaultAutomationPolicy.enabled,
    sessions: {
      heartbeatIntervalSeconds:
        config?.sessions?.heartbeat_interval_seconds ??
        defaultAutomationPolicy.sessions.heartbeatIntervalSeconds,
      staleAfterSeconds:
        config?.sessions?.stale_after_seconds ?? defaultAutomationPolicy.sessions.staleAfterSeconds,
    },
    checkpoints: {
      onAgentSwitch:
        config?.checkpoints?.on_agent_switch ?? defaultAutomationPolicy.checkpoints.onAgentSwitch,
      onSessionClose:
        config?.checkpoints?.on_session_close ?? defaultAutomationPolicy.checkpoints.onSessionClose,
      recoveryOnTimeout:
        config?.checkpoints?.recovery_on_timeout ??
        defaultAutomationPolicy.checkpoints.recoveryOnTimeout,
      minimumIntervalSeconds:
        config?.checkpoints?.minimum_interval_seconds ??
        defaultAutomationPolicy.checkpoints.minimumIntervalSeconds,
    },
  });
}

export function automationPolicyToConfig(policy: AutomationPolicy): AutomationConfig {
  return {
    enabled: policy.enabled,
    sessions: {
      heartbeat_interval_seconds: policy.sessions.heartbeatIntervalSeconds,
      stale_after_seconds: policy.sessions.staleAfterSeconds,
    },
    checkpoints: {
      on_agent_switch: policy.checkpoints.onAgentSwitch,
      on_session_close: policy.checkpoints.onSessionClose,
      recovery_on_timeout: policy.checkpoints.recoveryOnTimeout,
      minimum_interval_seconds: policy.checkpoints.minimumIntervalSeconds,
    },
  };
}
