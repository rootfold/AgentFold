---
schema: 1
task_id: AF-20260721-002
title: Fix macOS symlink path CI failures
status: active
started_at: 2026-07-21T04:20:37.564Z
updated_at: 2026-07-21T04:29:56.573Z
working_context: .
starting_branch: main
current_branch: main
starting_commit: c2522f8ea2f507ca204fdb2b016e5c395c880aad
current_commit: c2522f8ea2f507ca204fdb2b016e5c395c880aad
starting_agent: codex
last_agent: codex
report_revision: 2
latest_report_at: 2026-07-21T04:29:55.498Z
checkpoint_history:
  count: 1
  latest_checkpoint_at: 2026-07-21T04:29:56.573Z
  latest_checkpoint_id: CP-001
  latest_fingerprint: 7be0942d2837d9428c506b6f05e8a25d8661fde030831df2b2c06994dbeb91e4
  latest_semantic_revision: 2
---

# Objective

> Correct cross-platform path-boundary checks so normal macOS temporary-directory aliases are accepted without weakening symlink-escape protection, and restore the connector and service test suites.

# Completed

- Identified macOS /var to /private/var canonicalization as the shared cause of 30 connector and service CI failures.
- Added shared normalization for fixed macOS system aliases while retaining rejection of all other symlink components and real-path mismatches.
- Applied the normalization to connector host paths, service runtime preparation, and service client attachment.
- Added deterministic regression tests for accepted system aliases and rejected nested symlinks.
- Fixed macOS CI failures caused by /var temporary paths resolving through Apple's /private/var system alias.
- Kept nested and arbitrary symlink components unsafe for connector targets and service runtime directories.
- Updated the service client to recognize the same verified canonical aliases used during runtime preparation.
- Added cross-platform regression coverage and documented the macOS alias behavior.

# In progress

- Run the complete repository quality suite and build.

# Decisions

## Entry 1

Decision: Allow only the fixed macOS /var, /tmp, and /etc aliases when their real paths exactly match /private equivalents.
Reason: This supports normal macOS filesystem behavior without broadly allowing symlink traversal or weakening repository-boundary checks.

## Entry 2

Decision: Canonicalize only /var, /tmp, and /etc on macOS, and require each alias to resolve exactly to its /private counterpart.
Reason: The rule handles operating-system aliases deterministically without allowing user-controlled symlink traversal.

# Failed attempts



# Blockers



# Next actions



# Validation

## Entry 1

Command: .\node_modules\.bin\vitest.cmd run <six affected suites>
Status: passed
Summary: All 39 affected connector, service runtime, IPC, and CLI tests passed.

## Entry 2

Command: .\node_modules\.bin\tsc.cmd --noEmit
Status: passed
Summary: Type checking passed after the path-safety changes.

## Entry 3

Command: .\node_modules\.bin\eslint.cmd <changed TypeScript files>
Status: passed
Summary: Targeted lint passed.

## Entry 4

Command: .\node_modules\.bin\vitest.cmd run
Status: passed
Summary: 45 test files passed with 330 passing tests; 2 files and 2 tests were skipped.

## Entry 5

Command: .\node_modules\.bin\eslint.cmd .
Status: passed
Summary: Repository lint passed.

## Entry 6

Command: .\node_modules\.bin\tsc.cmd --noEmit
Status: passed
Summary: Repository type checking passed.

## Entry 7

Command: .\node_modules\.bin\tsup.cmd
Status: passed
Summary: ESM and declaration builds passed.

## Entry 8

Command: .\node_modules\.bin\prettier.cmd --check <changed files>
Status: passed
Summary: Every file changed for the macOS fix is formatted.

## Entry 9

Command: .\node_modules\.bin\prettier.cmd --check .
Status: warning
Summary: Only the existing connector-managed .agents/rules/agentfold-continuity.md and AGENTS.md files are reported.

## Entry 10

Command: git diff --check
Status: passed
Summary: No whitespace errors were found.

# Unverified assumptions


