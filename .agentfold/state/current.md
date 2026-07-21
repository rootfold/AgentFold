---
schema: 1
task_id: AF-20260721-001
title: Document AgentFold MCP usage
status: active
started_at: 2026-07-21T04:06:01.728Z
updated_at: 2026-07-21T04:14:59.731Z
working_context: .
starting_branch: main
current_branch: main
starting_commit: c97b5efa398509460de80314523a56032d1c1076
current_commit: c97b5efa398509460de80314523a56032d1c1076
starting_agent: codex
last_agent: antigravity
report_revision: 3
latest_report_at: 2026-07-21T04:14:59.041Z
checkpoint_history:
  count: 2
  latest_checkpoint_at: 2026-07-21T04:14:59.731Z
  latest_checkpoint_id: CP-002
  latest_fingerprint: 6787e6b8ecd0343558d898f167ac44a125fcd4b938a8dd14af33c9fd76dada0c
  latest_semantic_revision: 3
---

# Objective

> Update README.md with concise, accurate usage examples for connecting Codex to AgentFold and using the AgentFold MCP lifecycle.

# Completed

- Added README setup examples for previewing, installing, and verifying the Codex connector.
- Added copyable Codex prompts for MCP status checks, focused work, and checkpoint-based continuation.
- Documented the eight-tool MCP lifecycle plus privacy and non-mutating Git boundaries.
- Updated README.md with Codex connector setup, verification, and MCP lifecycle usage examples.
- Validated the README examples against the implemented CLI command surface.
- Completed repository lint, typecheck, test, build, and README-specific formatting and whitespace checks.
- Validated entire repository tests and types for README update.
- Task is fully completed.

# In progress

- Run repository validation for the README-only change.

# Decisions

## Entry 1

Decision: Document natural-language Codex prompts alongside CLI setup commands.
Reason: Users operate MCP tools through a connected coding agent, so prompt examples are more actionable than pretending tool calls are shell commands.

## Entry 2

Decision: Keep the usage guide in README concise and link to the detailed Codex and MCP integration documents.
Reason: The README should provide a working path without duplicating connector internals already maintained in focused documentation.

# Failed attempts

## Entry 1

Attempt: Run CLI help and quality checks through the pnpm shim.
Result: The local pnpm wrapper attempted a non-interactive modules-directory purge because its store differed from the existing install; validation used the checked-in node_modules binaries instead and did not reinstall dependencies.

# Blockers



# Next actions



# Validation

## Entry 1

Command: .\node_modules\.bin\prettier.cmd --check README.md
Status: passed
Summary: README formatting matches the repository style.

## Entry 2

Command: .\node_modules\.bin\tsx.cmd src\cli\index.ts --help
Status: passed
Summary: The documented connect and verify commands are present in the live CLI.

## Entry 3

Command: .\node_modules\.bin\tsx.cmd src\cli\index.ts connect --help
Status: passed
Summary: The documented --dry-run, --yes, and --surface options match the implemented command.

## Entry 4

Command: .\node_modules\.bin\prettier.cmd --check README.md
Status: passed
Summary: README.md matches Prettier formatting.

## Entry 5

Command: .\node_modules\.bin\eslint.cmd .
Status: passed
Summary: ESLint completed without findings.

## Entry 6

Command: .\node_modules\.bin\tsc.cmd --noEmit
Status: passed
Summary: TypeScript type checking passed.

## Entry 7

Command: .\node_modules\.bin\vitest.cmd run
Status: passed
Summary: 44 test files passed with 327 passing tests; 2 files and 2 tests were skipped.

## Entry 8

Command: .\node_modules\.bin\tsup.cmd
Status: passed
Summary: ESM and declaration builds succeeded.

## Entry 9

Command: git diff --check -- README.md
Status: passed
Summary: The README change has no whitespace errors.

## Entry 10

Command: .\node_modules\.bin\prettier.cmd --check .
Status: warning
Summary: README passed; only pre-existing untracked connector-managed AGENTS.md files were reported.

## Entry 11

Command: git diff --check
Status: warning
Summary: README passed; the MCP-generated active-state Markdown has a blank line at EOF.

## Entry 12

Command: pnpm lint; pnpm typecheck; pnpm test
Status: passed
Summary: Linting, type checking, and 327 unit tests passed successfully.

# Unverified assumptions


