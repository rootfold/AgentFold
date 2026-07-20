# 0005: Resume packets from immutable checkpoints

- Status: accepted
- Date: 2026-07-21

## Context

A fresh coding-agent session needs enough verified continuity to resume useful work without receiving an entire repository, conversation, or terminal history. Mutable active state may advance after a checkpoint and Git metadata alone cannot establish intent, decisions, failed approaches, blockers, validation meaning, or next actions. Re-reading Git during resume would also make the handoff differ from the immutable snapshot the developer selected.

Different coding agents have native instruction files, but building adapters or generating those files would expand this milestone beyond a portable continuation packet. Unbounded checkpoint data could also consume excessive agent context or allow low-priority history to crowd out safety and current blockers.

## Decision

- `resume` consumes a validated immutable checkpoint referenced by active-state history metadata. It never falls back to mutable task conclusions. Older state without a latest checkpoint ID may select the highest valid same-task checkpoint filename with an explicit warning, without repairing state.
- Resume uses the canonical-context loader, active-state loader, and exported checkpoint parser. It does not independently inspect Git, read source files, load diffs, or interpret checkpoint Markdown ad hoc.
- A typed `ResumePacket` separates packet assembly from deterministic Markdown and JSON rendering. The packet excludes the absolute repository root, full canonical documents, source content, complete diffs, environment data, diagnostics, and machine-specific paths.
- Automatically observed Git facts remain visibly separate from agent-reported conclusions. Git metadata is never presented as proof of an engineering decision, blocker, failure, validation result, or intent.
- Target behavior is a small validated hint. It changes a display label, one opening instruction, and—only when already present inside the repository—a suggestion to read `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md`. It is not an adapter or instruction-generation system.
- Explicit deterministic budgets preserve safety, objective, blockers, next actions, failed attempts, and validation failures ahead of lower-priority material. Whole structured entries are retained or omitted, omitted counts are recorded, and the original checkpoint is never mutated.
- Output files are repository-relative, boundary checked, and atomically created without overwrite. Standard output remains a pure Markdown or JSON packet; diagnostics use standard error.
- Resume defensively verifies task identity and checkpoint fingerprint and rechecks selected packet text for secret-like content. It never rewrites a corrupt or unsafe checkpoint.
- The completion instruction asks the receiving agent for concise structured conclusions, not private chain of thought, secrets, conversations, or transcripts.

## Consequences

The same factual packet can be pasted into different coding agents or consumed as stable JSON without each integration parsing project files. Historical checkpoints remain inspectable and are clearly marked as non-latest. Packets stay compact and deterministic, at the cost of omitting bounded lower-priority entries when a checkpoint is large. Resume remains read-only unless the developer explicitly requests a new output file, and even then task state, checkpoint history, Git, instruction files, and repository configuration are unchanged.
