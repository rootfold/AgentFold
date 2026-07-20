# 0003: Active task state and structured agent reports

- Status: accepted
- Date: 2026-07-20

## Context

Canonical project context describes durable facts that every coding agent should share. Continuity also requires short-lived task state: the current objective, progress, decisions, failed attempts, blockers, validation, assumptions, and next actions. Copying complete conversations or inferring conclusions from Git changes would be noisy, privacy-sensitive, and unreliable.

## Decision

- Active task state is stored separately at `.agentfold/state/current.md`. Canonical context remains durable and task-neutral.
- The active file is deterministic Markdown with validated YAML front matter. It stores repository-relative context and read-only starting/current Git facts, never full diffs or source files.
- `agentfold start` previews by default and atomically creates active state only with `--yes`. It never replaces an existing task.
- Agents submit strict structured JSON through `agentfold report --stdin`. Reports contain concise conclusions and work summaries, not private chain of thought, reasoning traces, complete conversations, or chat transcripts.
- AgentFold does not infer architectural decisions, resolved blockers, or progress from Git changes. A diff shows changed text, not the developer's intent or verified conclusions.
- Reports merge by preserving existing entries, then appending genuinely new entries in report order. Exact trimmed entries are deduplicated; missing later entries never delete earlier conclusions.
- Secret-like values are conservatively redacted before state serialization. Diagnostics report only redaction counts and never echo the submitted value.
- Active state remains mutable. Future checkpoint history will be separate and immutable so a current working view can evolve without rewriting historical snapshots.
- `state.visibility: local` causes an ignore check and a warning when `.agentfold/state/` is not ignored. AgentFold does not edit `.gitignore`.

## Consequences

Future checkpoint and resume commands can build on one validated state boundary without parsing agent conversations. Reports are deterministic, local, inspectable, and safe to submit from different coding agents. This decision does not add checkpoint history, changed-file collection, diff statistics, adapters, synchronization, managed processes, hooks, watchers, network calls, or model integrations.
