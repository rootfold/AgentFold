<!-- agentfold:codex:start schema=1 -->
## AgentFold continuity for Codex

- Use AgentFold for substantive repository-changing work.
- Before modifying files, call `agentfold_open_session` and continue a relevant active task.
- Call `agentfold_begin_task` only when no relevant active task exists; do not create tasks for simple questions or read-only inspection.
- After meaningful milestones, call `agentfold_report_progress` with concise engineering conclusions only.
- Before ending substantial work, call `agentfold_close_session`, include a concise final report, and leave checkpoint creation enabled.
- Preserve uncommitted work and avoid repeated failed approaches identified by continuation packets.
- Treat reused or absent semantic context cautiously and verify assumptions against the repository.
- Never report private chain of thought, complete conversations, secrets, or environment values.
- Never commit, push, discard work, or replace an unrelated active task without the user's confirmation.
<!-- agentfold:codex:end -->
