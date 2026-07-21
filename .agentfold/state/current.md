---
schema: 1
task_id: AF-20260721-002
title: Fix macOS symlink path CI failures
status: active
started_at: 2026-07-21T04:20:37.564Z
updated_at: 2026-07-21T04:43:48.547Z
working_context: .
starting_branch: main
current_branch: main
starting_commit: c2522f8ea2f507ca204fdb2b016e5c395c880aad
current_commit: 0a75b0f36d8fcda4c51110483d9f12cbafa8bb47
starting_agent: codex
last_agent: codex
report_revision: 7
latest_report_at: 2026-07-21T04:43:36.686Z
checkpoint_history:
  count: 5
  latest_checkpoint_at: 2026-07-21T04:43:48.547Z
  latest_checkpoint_id: CP-005
  latest_fingerprint: 1e66484d7ff2d62921e4c52b4a6c9a4b587413b9a43387bf2fe3f8579e63cdee
  latest_semantic_revision: 7
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
- Ran complete repository quality suite.
- Verified build passes successfully.
- All validation tests passed for macOS path fix.
- Task fully completed and verified.
- Diagnosed the Windows CI regression as harmless 8.3 short-name expansion being mistaken for a symlink after the macOS fix.
- Restored the distinction between authoritative component-level symlink inspection and real-path comparison used only when inspection is unavailable.
- Added a deterministic Windows short-name expansion regression test.
- Fixed Windows CI failures caused by realPath expanding an 8.3 short-name component despite no symlink being present.
- Kept component-level symlink inspection authoritative and retained real-path comparison as the fallback when inspection is unavailable.
- Added deterministic Windows short-name regression coverage.
- Fixed Windows CI failures caused by realPath expanding an 8.3 short-name component without a symlink.
- Kept component-level symlink inspection authoritative and retained real-path comparison only as a fallback.

# In progress

- Run the complete repository quality suite and build.
- Run the complete repository validation suite for the Windows follow-up.

# Decisions

## Entry 1

Decision: Allow only the fixed macOS /var, /tmp, and /etc aliases when their real paths exactly match /private equivalents.
Reason: This supports normal macOS filesystem behavior without broadly allowing symlink traversal or weakening repository-boundary checks.

## Entry 2

Decision: Canonicalize only /var, /tmp, and /etc on macOS, and require each alias to resolve exactly to its /private counterpart.
Reason: The rule handles operating-system aliases deterministically without allowing user-controlled symlink traversal.

## Entry 3

Decision: Use real-path spelling equality only as a fallback when FileSystem.isSymbolicLink is unavailable.
Reason: Windows realPath may change path spelling without a symlink, while component inspection can still reject actual reparse-point symlinks.

## Entry 4

Decision: Do not require lexical and real paths to have identical spelling when component-level symlink inspection succeeds.
Reason: Windows canonicalization can expand short names without changing path identity or introducing a symlink.

## Entry 5

Decision: Use real-path spelling equality only when component-level symlink inspection is unavailable.
Reason: Windows can expand short names without changing path identity.

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

## Entry 11

Command: pnpm lint; pnpm typecheck; pnpm test; pnpm build
Status: passed
Summary: Lint, type check, 330 unit tests, and build completed successfully.

## Entry 12

Command: .\node_modules\.bin\vitest.cmd run tests\service\runtime-and-state.test.ts tests\service\ipc.test.ts tests\connectors\platform-path-aliases.test.ts
Status: passed
Summary: All 11 affected runtime, IPC, and path-alias tests passed.

## Entry 13

Command: .\node_modules\.bin\tsc.cmd --noEmit
Status: passed
Summary: Type checking passed.

## Entry 14

Command: .\node_modules\.bin\vitest.cmd run
Status: passed
Summary: 45 test files passed with 331 passing tests; 2 files and 2 tests were skipped.

## Entry 15

Command: .\node_modules\.bin\prettier.cmd --check <changed files>
Status: passed
Summary: Changed files match repository formatting.

## Entry 16

Command: .\node_modules\.bin\vitest.cmd run
Status: passed
Summary: 45 test files and 331 tests passed; 2 files and 2 tests skipped.

## Entry 17

Command: .\node_modules\.bin\tsup.cmd
Status: passed
Summary: Build passed.

## Entry 18

Command: git diff --check
Status: passed
Summary: No whitespace errors.

# Unverified assumptions


