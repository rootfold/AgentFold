import { agentReportSchema } from "./agent-report-schema.js";
import type { AgentReport } from "./types.js";

export interface SecretRedactionResult<T> {
  readonly value: T;
  readonly redactionCount: number;
  readonly safe: boolean;
}

interface RedactionPattern {
  readonly expression: RegExp;
  readonly replacement: string | ((...arguments_: string[]) => string);
}

function patterns(): readonly RedactionPattern[] {
  return [
    {
      expression:
        /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/giu,
      replacement: "[REDACTED]",
    },
    {
      expression: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/giu,
      replacement: "Bearer [REDACTED]",
    },
    {
      expression:
        /\b(api[_-]?key|password|passwd|secret|token|access[_-]?token)\s*([:=])\s*(?:"[^"]+"|'[^']+'|[^\s,;]+)/giu,
      replacement: (_match, name, separator) => `${name}${separator}[REDACTED]`,
    },
    {
      expression: /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/giu,
      replacement: (_match, scheme) => `${scheme}[REDACTED]@`,
    },
    {
      expression: /\bAKIA[0-9A-Z]{16}\b/gu,
      replacement: "[REDACTED]",
    },
    {
      expression: /\bAIza[0-9A-Za-z_-]{20,}\b/gu,
      replacement: "[REDACTED]",
    },
    {
      expression: /\b(?:ghp|github_pat|sk)_[A-Za-z0-9_-]{16,}\b/gu,
      replacement: "[REDACTED]",
    },
  ];
}

function redactText(input: string): SecretRedactionResult<string> {
  let value = input;
  let redactionCount = 0;

  for (const pattern of patterns()) {
    value = value.replace(pattern.expression, (...arguments_: string[]) => {
      const match = arguments_[0] ?? "";
      if (match.includes("[REDACTED]")) {
        return match;
      }
      redactionCount += 1;
      return typeof pattern.replacement === "string"
        ? pattern.replacement
        : pattern.replacement(...arguments_);
    });
  }

  const safe = !patterns().some((pattern) => {
    const matches = value.match(pattern.expression) ?? [];
    return matches.some((match) => !match.includes("[REDACTED]"));
  });

  return { value, redactionCount, safe };
}

export function redactAgentReport(report: AgentReport): SecretRedactionResult<AgentReport> {
  let redactionCount = 0;
  let safe = true;
  const redact = (value: string): string => {
    const result = redactText(value);
    redactionCount += result.redactionCount;
    safe &&= result.safe;
    return result.value;
  };
  const value = agentReportSchema.parse({
    ...(report.agent === undefined ? {} : { agent: redact(report.agent) }),
    completed: report.completed.map(redact),
    inProgress: report.inProgress.map(redact),
    decisions: report.decisions.map((item) => ({
      decision: redact(item.decision),
      reason: redact(item.reason),
    })),
    failedAttempts: report.failedAttempts.map((item) => ({
      attempt: redact(item.attempt),
      result: redact(item.result),
    })),
    blockers: report.blockers.map(redact),
    nextActions: report.nextActions.map(redact),
    validation: report.validation.map((item) => ({
      command: redact(item.command),
      status: item.status,
      summary: redact(item.summary),
    })),
    assumptions: report.assumptions.map(redact),
  });

  return { value, redactionCount, safe };
}
