import { describe, expect, it } from "vitest";

import type { ChangedPathGroups } from "../../src/core/git/checkpoint-git-types.js";
import { aggregateDiffStatistics, parseNumstat } from "../../src/core/git/parse-numstat.js";
import { parsePorcelainV2 } from "../../src/core/git/parse-porcelain-v2.js";

const hash = "0123456789abcdef0123456789abcdef01234567";

function ordinary(xy: string, path: string): string {
  return `1 ${xy} N... 100644 100644 100644 ${hash} ${hash} ${path}`;
}

function moved(xy: string, score: string, destination: string, source: string): string {
  return `2 ${xy} N... 100644 100644 100644 ${hash} ${hash} ${score} ${destination}\0${source}`;
}

function emptyGroups(overrides: Partial<ChangedPathGroups> = {}): ChangedPathGroups {
  return {
    added: [],
    modified: [],
    deleted: [],
    renamed: [],
    copied: [],
    untracked: [],
    unmerged: [],
    ...overrides,
  };
}

describe("porcelain v2 parser", () => {
  it("handles clean repositories", () => {
    expect(parsePorcelainV2("")).toEqual({
      workingTree: "clean",
      hasStagedChanges: false,
      hasUnstagedChanges: false,
      changedPaths: emptyGroups(),
    });
  });

  it("groups staged, unstaged, untracked, deleted, renamed, copied, and unmerged paths", () => {
    const source = [
      ordinary("A.", "src/added file.ts"),
      ordinary(".M", "src/modified.ts"),
      ordinary("MM", "src/both.ts"),
      ordinary(".D", "src/deleted.ts"),
      moved("R.", "R100", "src/new name.ts", "src/old name.ts"),
      moved("C.", "C100", "src/copy.ts", "src/original.ts"),
      `u UU N... 100644 100644 100644 100644 ${hash} ${hash} ${hash} src/conflict.ts`,
      "? tests/über test.ts",
      "",
    ].join("\0");

    expect(parsePorcelainV2(source)).toEqual({
      workingTree: "dirty",
      hasStagedChanges: true,
      hasUnstagedChanges: true,
      changedPaths: {
        added: ["src/added file.ts"],
        modified: ["src/both.ts", "src/modified.ts"],
        deleted: ["src/deleted.ts"],
        renamed: [{ from: "src/old name.ts", to: "src/new name.ts" }],
        copied: [{ from: "src/original.ts", to: "src/copy.ts" }],
        untracked: ["tests/über test.ts"],
        unmerged: ["src/conflict.ts"],
      },
    });
  });

  it("normalizes Windows separators without losing spaces or Unicode", () => {
    const parsed = parsePorcelainV2(`? packages\\app space\\日本語.ts\0`);
    expect(parsed.changedPaths.untracked).toEqual(["packages/app space/日本語.ts"]);
  });
});

describe("numstat parser and aggregation", () => {
  it("parses text, binary, and rename records without file contents", () => {
    expect(
      parseNumstat(
        [
          "10\t2\tsrc/file with space.ts",
          "-\t-\tassets/image.bin",
          "3\t1\t",
          "src/old.ts",
          "src/new.ts",
          "",
        ].join("\0"),
      ),
    ).toEqual([
      { path: "src/file with space.ts", insertions: 10, deletions: 2 },
      { path: "assets/image.bin", insertions: null, deletions: null },
      { path: "src/new.ts", originalPath: "src/old.ts", insertions: 3, deletions: 1 },
    ]);
  });

  it("totals staged and unstaged lines while counting a path changed in both once", () => {
    const groups = emptyGroups({
      added: ["src/new.ts"],
      modified: ["src/both.ts"],
      deleted: ["src/old.ts"],
      untracked: ["tmp/untracked.ts"],
    });
    const staged = parseNumstat(["5\t1\tsrc/both.ts", "2\t0\tsrc/new.ts", ""].join("\0"));
    const unstaged = parseNumstat(["3\t2\tsrc/both.ts", "-\t-\tsrc/old.ts", ""].join("\0"));

    expect(aggregateDiffStatistics(groups, staged, unstaged)).toEqual({
      filesChanged: 3,
      insertions: 10,
      deletions: 3,
      binaryFiles: 1,
      untrackedFiles: 1,
    });
  });

  it("excludes all line totals for a path reported as binary in either diff layer", () => {
    const groups = emptyGroups({ modified: ["asset.dat"] });
    const staged = [{ path: "asset.dat", insertions: null, deletions: null }];
    const unstaged = [{ path: "asset.dat", insertions: 4, deletions: 2 }];

    expect(aggregateDiffStatistics(groups, staged, unstaged)).toEqual({
      filesChanged: 1,
      insertions: 0,
      deletions: 0,
      binaryFiles: 1,
      untrackedFiles: 0,
    });
  });

  it("returns zero totals for empty changes", () => {
    expect(aggregateDiffStatistics(emptyGroups(), [], [])).toEqual({
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      binaryFiles: 0,
      untrackedFiles: 0,
    });
  });
});
