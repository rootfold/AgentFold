import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { activeTaskSchema } from "./active-state-schema.js";
import type { ActiveTask, Decision, FailedAttempt, ValidationResult } from "./types.js";

const sectionNames = [
  "Objective",
  "Completed",
  "In progress",
  "Decisions",
  "Failed attempts",
  "Blockers",
  "Next actions",
  "Validation",
  "Unverified assumptions",
] as const;

const frontMatterSchema = z
  .object({
    schema: z.literal(1),
    task_id: z.string(),
    title: z.string(),
    status: z.string(),
    started_at: z.string(),
    updated_at: z.string(),
    working_context: z.string(),
    starting_branch: z.string(),
    current_branch: z.string(),
    starting_commit: z.string().nullable(),
    current_commit: z.string().nullable(),
    starting_agent: z.string().optional(),
    last_agent: z.string().optional(),
    checkpoint_history: z
      .object({
        count: z.number(),
        latest_checkpoint_at: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

export interface ActiveStateParseIssue {
  readonly path: string;
  readonly message: string;
}

export class ActiveStateParseError extends Error {
  constructor(readonly issues: readonly ActiveStateParseIssue[]) {
    super(
      `Invalid active task state:\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}`,
    );
    this.name = "ActiveStateParseError";
  }
}

function parseError(path: string, message: string): ActiveStateParseError {
  return new ActiveStateParseError([{ path, message }]);
}

function zodIssues(error: z.ZodError): readonly ActiveStateParseIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length === 0 ? "<root>" : issue.path.map(String).join("."),
    message: issue.message,
  }));
}

function splitSections(body: string): Readonly<Record<(typeof sectionNames)[number], string>> {
  const headings = [...body.matchAll(/^# (.+)$/gmu)];
  const names = headings.map((match) => match[1]);

  if (
    names.length !== sectionNames.length ||
    names.some((name, index) => name !== sectionNames[index])
  ) {
    throw parseError(
      "body",
      `Required sections must appear once in this order: ${sectionNames.join(", ")}`,
    );
  }

  return Object.fromEntries(
    headings.map((match, index) => {
      const name = sectionNames[index];
      if (name === undefined || match.index === undefined) {
        throw parseError("body", "Could not identify a required section");
      }
      const contentStart = match.index + match[0].length;
      const next = headings[index + 1];
      return [name, body.slice(contentStart, next?.index ?? body.length).trim()];
    }),
  ) as Readonly<Record<(typeof sectionNames)[number], string>>;
}

function parseStringList(content: string, section: string): readonly string[] {
  if (content.length === 0) {
    return [];
  }

  return content.split("\n").map((line, index) => {
    if (!line.startsWith("- ")) {
      throw parseError(section, `Entry ${index + 1} must be a Markdown list item`);
    }
    return line.slice(2);
  });
}

function entryBlocks(content: string, section: string): readonly string[] {
  if (content.length === 0) {
    return [];
  }

  const matches = [...content.matchAll(/^## Entry (\d+)$/gmu)];
  if (matches.length === 0 || matches[0]?.index !== 0) {
    throw parseError(section, "Structured entries must begin with an Entry heading");
  }

  return matches.map((match, index) => {
    if (Number(match[1]) !== index + 1 || match.index === undefined) {
      throw parseError(section, "Entry headings must be sequential");
    }
    const start = match.index + match[0].length;
    const next = matches[index + 1];
    return content.slice(start, next?.index ?? content.length).trim();
  });
}

function labeledLines(
  block: string,
  section: string,
  labels: readonly string[],
): readonly string[] {
  const lines = block.split("\n");
  if (lines.length !== labels.length) {
    throw parseError(section, `Each entry requires: ${labels.join(", ")}`);
  }

  return labels.map((label, index) => {
    const prefix = `${label}: `;
    const line = lines[index] ?? "";
    if (!line.startsWith(prefix)) {
      throw parseError(section, `Expected ${label} field`);
    }
    return line.slice(prefix.length);
  });
}

function parseDecisions(content: string): readonly Decision[] {
  return entryBlocks(content, "Decisions").map((block) => {
    const [decision = "", reason = ""] = labeledLines(block, "Decisions", ["Decision", "Reason"]);
    return { decision, reason };
  });
}

function parseFailedAttempts(content: string): readonly FailedAttempt[] {
  return entryBlocks(content, "Failed attempts").map((block) => {
    const [attempt = "", result = ""] = labeledLines(block, "Failed attempts", [
      "Attempt",
      "Result",
    ]);
    return { attempt, result };
  });
}

function parseValidation(content: string): readonly ValidationResult[] {
  return entryBlocks(content, "Validation").map((block) => {
    const [command = "", status = "", summary = ""] = labeledLines(block, "Validation", [
      "Command",
      "Status",
      "Summary",
    ]);
    return { command, status: status as ValidationResult["status"], summary };
  });
}

export function parseActiveState(input: string): ActiveTask {
  const source = input.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/u);
  if (match === null) {
    throw parseError("frontmatter", "Expected YAML front matter delimited by ---");
  }

  let rawFrontMatter: unknown;
  try {
    rawFrontMatter = parseYaml(match[1] ?? "");
  } catch {
    throw parseError("frontmatter", "Malformed YAML front matter");
  }

  const frontMatterResult = frontMatterSchema.safeParse(rawFrontMatter);
  if (!frontMatterResult.success) {
    throw new ActiveStateParseError(zodIssues(frontMatterResult.error));
  }

  const sections = splitSections((match[2] ?? "").trim());
  if (!sections.Objective.startsWith("> ")) {
    throw parseError("Objective", "Objective must be a quoted Markdown paragraph");
  }

  const frontMatter = frontMatterResult.data;
  const stateResult = activeTaskSchema.safeParse({
    schemaVersion: frontMatter.schema,
    taskId: frontMatter.task_id,
    title: frontMatter.title,
    status: frontMatter.status,
    startedAt: frontMatter.started_at,
    updatedAt: frontMatter.updated_at,
    workingContext: frontMatter.working_context,
    startingBranch: frontMatter.starting_branch,
    currentBranch: frontMatter.current_branch,
    startingCommit: frontMatter.starting_commit,
    currentCommit: frontMatter.current_commit,
    ...(frontMatter.starting_agent === undefined
      ? {}
      : { startingAgent: frontMatter.starting_agent }),
    ...(frontMatter.last_agent === undefined ? {} : { lastAgent: frontMatter.last_agent }),
    objective: sections.Objective.slice(2),
    completed: parseStringList(sections.Completed, "Completed"),
    inProgress: parseStringList(sections["In progress"], "In progress"),
    decisions: parseDecisions(sections.Decisions),
    failedAttempts: parseFailedAttempts(sections["Failed attempts"]),
    blockers: parseStringList(sections.Blockers, "Blockers"),
    nextActions: parseStringList(sections["Next actions"], "Next actions"),
    validation: parseValidation(sections.Validation),
    assumptions: parseStringList(sections["Unverified assumptions"], "Unverified assumptions"),
    checkpointHistory: {
      count: frontMatter.checkpoint_history.count,
      latestCheckpointAt: frontMatter.checkpoint_history.latest_checkpoint_at,
    },
  });

  if (!stateResult.success) {
    throw new ActiveStateParseError(zodIssues(stateResult.error));
  }

  return stateResult.data;
}
