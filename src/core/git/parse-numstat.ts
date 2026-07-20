import type { ChangedPathGroups, DiffStatistics } from "./checkpoint-git-types.js";
import { normalizeGitPath } from "./git-path.js";

export interface GitNumstatEntry {
  readonly path: string;
  readonly originalPath?: string;
  readonly insertions: number | null;
  readonly deletions: number | null;
}

export class GitNumstatParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitNumstatParseError";
  }
}

function lineCount(value: string): number | null {
  if (value === "-") return null;
  if (!/^\d+$/u.test(value)) throw new GitNumstatParseError("Git returned invalid numstat data");
  return Number(value);
}

export function parseNumstat(source: string): readonly GitNumstatEntry[] {
  const records = source.split("\0");
  const entries: GitNumstatEntry[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (record.length === 0) continue;
    const firstTab = record.indexOf("\t");
    const secondTab = record.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) {
      throw new GitNumstatParseError("Git returned malformed numstat data");
    }

    const insertions = lineCount(record.slice(0, firstTab));
    const deletions = lineCount(record.slice(firstTab + 1, secondTab));
    const pathPart = record.slice(secondTab + 1);
    if (pathPart.length > 0) {
      entries.push({ path: normalizeGitPath(pathPart), insertions, deletions });
      continue;
    }

    const originalPath = records[index + 1];
    const destinationPath = records[index + 2];
    if (!originalPath || !destinationPath) {
      throw new GitNumstatParseError("Git rename numstat omitted a path");
    }
    index += 2;
    entries.push({
      path: normalizeGitPath(destinationPath),
      originalPath: normalizeGitPath(originalPath),
      insertions,
      deletions,
    });
  }

  return entries;
}

export function aggregateDiffStatistics(
  changedPaths: ChangedPathGroups,
  staged: readonly GitNumstatEntry[],
  unstaged: readonly GitNumstatEntry[],
): DiffStatistics {
  const trackedPaths = new Set([
    ...changedPaths.added,
    ...changedPaths.modified,
    ...changedPaths.deleted,
    ...changedPaths.unmerged,
    ...changedPaths.renamed.map((move) => move.to),
    ...changedPaths.copied.map((move) => move.to),
  ]);
  const totalsByPath = new Map<
    string,
    { insertions: number; deletions: number; binary: boolean }
  >();

  for (const entry of [...staged, ...unstaged]) {
    const total = totalsByPath.get(entry.path) ?? {
      insertions: 0,
      deletions: 0,
      binary: false,
    };
    if (entry.insertions === null || entry.deletions === null) {
      total.binary = true;
    } else {
      total.insertions += entry.insertions;
      total.deletions += entry.deletions;
    }
    totalsByPath.set(entry.path, total);
  }

  const textTotals = [...totalsByPath.values()].filter((total) => !total.binary);

  return {
    filesChanged: trackedPaths.size,
    insertions: textTotals.reduce((sum, total) => sum + total.insertions, 0),
    deletions: textTotals.reduce((sum, total) => sum + total.deletions, 0),
    binaryFiles: [...totalsByPath.values()].filter((total) => total.binary).length,
    untrackedFiles: changedPaths.untracked.length,
  };
}
