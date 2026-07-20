# 0001: Safe initialization boundary

- Status: accepted
- Date: 2026-07-20

## Context

Milestone 1 needs to create the canonical AgentFold foundation in existing repositories without damaging user-owned files or widening the Milestone 0 abstractions unnecessarily.

## Decision

- `agentfold init` is preview-only by default. `--dry-run` makes that intent explicit and `--yes` authorizes non-interactive writes.
- Repository discovery walks upward for a `.git` marker and accepts either a directory or a worktree file.
- Metadata scanning is limited to known root-level marker files, `package.json`, lockfiles, and known top-level source/test directories. Project commands are never executed.
- All content, configuration validation, hashes, and the manifest are prepared before writing.
- Files are written to a uniquely named sibling staging directory and the directory is renamed to `.agentfold` only after preparation succeeds. Failed staging writes are removed.
- An existing configuration is idempotent and untouched. Any partial installation without a configuration is a conflict.
- The manifest uses SHA-256 for every listed generated payload. It does not hash itself because that would be self-referential.
- Canonical files are trackable; initialization does not edit `.gitignore`.

## Consequences

Initialization is deterministic apart from the documented timestamp and temporary staging name, both of which are injectable in tests. Interactive prompting and destructive force behavior remain out of scope.
