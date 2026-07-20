# 0004: Immutable checkpoint history

- Status: accepted
- Date: 2026-07-21

## Context

Active task state is a mutable working view. Continuity across agents also needs durable snapshots that say both what Git can prove and what an agent has explicitly reported. Git can establish branches, commits, changed paths, and aggregate line statistics, but a diff cannot reliably establish intent, architectural decisions, failed approaches, blockers, validation meaning, or next actions.

Storing full diffs or source files would make checkpoints large, leak repository content into continuity records, and duplicate information already held by Git. Repeated checkpoints with identical inputs would also create history noise without preserving any new fact.

## Decision

- Checkpoints are immutable, append-only Markdown records under `.agentfold/state/history/`, with strictly validated YAML front matter for round-trip loading.
- Every checkpoint visibly separates automatically observed Git facts from agent-reported semantic state and unverified assumptions. Observed facts never masquerade as semantic conclusions.
- Git observation stores repository-relative changed paths, aggregate staged and unstaged numstat totals, and bounded commit hashes and subjects. It stores no complete diff, patch, source-file content, commit body, untracked-file content, or absolute repository root.
- Semantic state is copied only from the validated active task. A monotonically increasing report revision records which successfully persisted semantic report the checkpoint includes. Git-only checkpoints use revision zero and carry an explicit warning.
- A deterministic SHA-256 fingerprint covers meaningful Git facts and the semantic report revision, but excludes timestamps, checkpoint IDs, agents, absolute paths, and formatting. When the latest fingerprint matches, no history or state file changes.
- Checkpoint IDs are deterministic per-task `CP-NNN` values. Existing history is never overwritten, and sequence exhaustion stops safely.
- Checkpoint persistence atomically creates history before atomically replacing current state. If state replacement fails, only the newly created history file is removed. A rollback failure is reported as a severe manual-recovery condition.
- Checkpoint creation is explicit today. Later integrations may invoke the same core operation automatically after submitting structured reports; that does not require changing the checkpoint model or granting Git mutation authority.

## Consequences

Future resume rendering can consume one typed record rather than re-reading Git or interpreting ad hoc Markdown. History remains compact, reviewable, and stable while active state evolves. Report freshness and Git freshness are independently visible. AgentFold still does not stage, commit, reset, stash, push, create branches, edit remotes, install hooks, watch files, contact a network service, or infer semantic conclusions from repository content.
