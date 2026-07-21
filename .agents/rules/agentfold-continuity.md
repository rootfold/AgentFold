<!-- agentfold:connector=antigravity schema=1 -->
# AgentFold continuity

Use AgentFold for substantive coding work in this workspace.

At the beginning of substantive implementation, debugging, refactoring, test, documentation, or architecture work:

1. Call `agentfold_open_session` before modifying files.
2. Read the returned continuation packet or project context and preserve existing uncommitted work.
3. If an active task exists, compare it with the user's request. Continue it when relevant; when unrelated, ask before changing task lifecycle. Do not replace, finish, or duplicate it automatically.
4. If no active task exists and the user requested substantive repository changes, call `agentfold_begin_task` with a concise title and objective.
5. Do not create a task for conceptual questions, explanations, read-only inspection, status requests, non-project conversation, or trivial formatting help without repository changes.

During substantial work:

1. Call `agentfold_report_progress` after meaningful milestones, not after every edit.
2. Record concise engineering conclusions: completed and current work, decisions, failed attempts, blockers, validation, next actions, and assumptions.
3. Never report private chain of thought, full conversations, source-file contents, environment values, tokens, passwords, or secrets.

Before ending the session or returning control after substantial changes:

1. Call `agentfold_close_session` with a final structured report and leave checkpoint creation enabled.
2. Do not claim continuity was recorded when an AgentFold tool failed.
3. Never discard uncommitted work, create commits, or push unless the user separately requested it.

When AgentFold returns a continuation packet, follow its next actions, preserve recorded decisions, avoid repeated failed approaches, and verify absent or stale semantic context before broad changes.
