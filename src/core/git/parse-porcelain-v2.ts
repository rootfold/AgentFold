import type { ChangedPathGroups, GitPathMove } from "./checkpoint-git-types.js";
import { comparePortablePaths, normalizeGitPath } from "./git-path.js";

export interface ParsedGitStatus {
  readonly workingTree: "clean" | "dirty";
  readonly hasStagedChanges: boolean;
  readonly hasUnstagedChanges: boolean;
  readonly changedPaths: ChangedPathGroups;
}

export class GitStatusParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitStatusParseError";
  }
}

function addStatusPath(
  status: string,
  path: string,
  groups: {
    readonly added: Set<string>;
    readonly modified: Set<string>;
    readonly deleted: Set<string>;
    readonly unmerged: Set<string>;
  },
): void {
  if (status === "A") groups.added.add(path);
  else if (status === "M" || status === "T") groups.modified.add(path);
  else if (status === "D") groups.deleted.add(path);
  else if (status === "U") groups.unmerged.add(path);
}

function parseOrdinary(record: string): { readonly xy: string; readonly path: string } {
  const match = record.match(/^1 (.{2}) \S+ \S+ \S+ \S+ \S+ \S+ (.*)$/u);
  if (match === null) throw new GitStatusParseError("Git returned malformed ordinary status data");
  return { xy: match[1] ?? "", path: normalizeGitPath(match[2] ?? "") };
}

function parseMoved(record: string): {
  readonly xy: string;
  readonly kind: "renamed" | "copied";
  readonly path: string;
} {
  const match = record.match(/^2 (.{2}) \S+ \S+ \S+ \S+ \S+ \S+ ([RC]\d+) (.*)$/u);
  if (match === null) throw new GitStatusParseError("Git returned malformed rename status data");
  return {
    xy: match[1] ?? "",
    kind: (match[2] ?? "").startsWith("R") ? "renamed" : "copied",
    path: normalizeGitPath(match[3] ?? ""),
  };
}

function parseUnmerged(record: string): { readonly xy: string; readonly path: string } {
  const match = record.match(/^u (.{2}) \S+ \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.*)$/u);
  if (match === null) throw new GitStatusParseError("Git returned malformed unmerged status data");
  return { xy: match[1] ?? "", path: normalizeGitPath(match[2] ?? "") };
}

function sorted(values: Set<string>): readonly string[] {
  return [...values].sort(comparePortablePaths);
}

function sortedMoves(values: readonly GitPathMove[]): readonly GitPathMove[] {
  return [...values].sort((left, right) => {
    const destination = comparePortablePaths(left.to, right.to);
    return destination === 0 ? comparePortablePaths(left.from, right.from) : destination;
  });
}

export function parsePorcelainV2(source: string): ParsedGitStatus {
  const records = source.split("\0");
  const added = new Set<string>();
  const modified = new Set<string>();
  const deleted = new Set<string>();
  const untracked = new Set<string>();
  const unmerged = new Set<string>();
  const renamed: GitPathMove[] = [];
  const copied: GitPathMove[] = [];
  let hasStagedChanges = false;
  let hasUnstagedChanges = false;
  let changeCount = 0;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (record.length === 0) continue;
    changeCount += 1;

    if (record.startsWith("1 ")) {
      const parsed = parseOrdinary(record);
      const [indexStatus = ".", worktreeStatus = "."] = parsed.xy;
      hasStagedChanges ||= indexStatus !== ".";
      hasUnstagedChanges ||= worktreeStatus !== ".";
      addStatusPath(indexStatus, parsed.path, { added, modified, deleted, unmerged });
      addStatusPath(worktreeStatus, parsed.path, { added, modified, deleted, unmerged });
      continue;
    }

    if (record.startsWith("2 ")) {
      const parsed = parseMoved(record);
      const originalRecord = records[index + 1];
      if (originalRecord === undefined || originalRecord.length === 0) {
        throw new GitStatusParseError("Git rename status omitted the original path");
      }
      index += 1;
      const move = { from: normalizeGitPath(originalRecord), to: parsed.path };
      (parsed.kind === "renamed" ? renamed : copied).push(move);
      const [indexStatus = ".", worktreeStatus = "."] = parsed.xy;
      hasStagedChanges ||= indexStatus !== ".";
      hasUnstagedChanges ||= worktreeStatus !== ".";
      if (indexStatus !== "R" && indexStatus !== "C") {
        addStatusPath(indexStatus, parsed.path, { added, modified, deleted, unmerged });
      }
      if (worktreeStatus !== "R" && worktreeStatus !== "C") {
        addStatusPath(worktreeStatus, parsed.path, { added, modified, deleted, unmerged });
      }
      continue;
    }

    if (record.startsWith("u ")) {
      const parsed = parseUnmerged(record);
      unmerged.add(parsed.path);
      hasStagedChanges = true;
      hasUnstagedChanges = true;
      continue;
    }

    if (record.startsWith("? ")) {
      untracked.add(normalizeGitPath(record.slice(2)));
      hasUnstagedChanges = true;
      continue;
    }

    if (!record.startsWith("! ")) {
      throw new GitStatusParseError("Git returned an unsupported porcelain-v2 record");
    }
  }

  return {
    workingTree: changeCount === 0 ? "clean" : "dirty",
    hasStagedChanges,
    hasUnstagedChanges,
    changedPaths: {
      added: sorted(added),
      modified: sorted(modified),
      deleted: sorted(deleted),
      renamed: sortedMoves(renamed),
      copied: sortedMoves(copied),
      untracked: sorted(untracked),
      unmerged: sorted(unmerged),
    },
  };
}
