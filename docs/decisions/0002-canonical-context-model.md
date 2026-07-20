# 0002: Canonical context model

- Status: accepted
- Date: 2026-07-20

## Context

Future coding-agent adapters need the same validated project identity, commands, paths, safety settings, and Markdown guidance. Allowing every adapter to parse YAML or read `.agentfold/context/` independently would duplicate boundary checks, produce inconsistent diagnostics, and make it easier for one adapter to read outside the repository.

## Decision

- Core context resolution locates the Git root, loads configuration through the existing YAML and Zod boundaries, and reads the five fixed canonical Markdown files.
- The resolver returns a discriminated result. A successful result contains one `CanonicalProjectContext`; failures and non-failing conditions are represented as structured diagnostics.
- The canonical model uses normalized internal names and complete path groups. Older valid configurations may omit `paths`; resolution supplies empty groups without rewriting the file.
- Configured paths are portable repository-relative values. Parsing normalizes separators, removes duplicates, orders values deterministically, and rejects absolute paths or parent traversal.
- Existing configured paths and canonical files are checked through their real paths. A symbolic link that resolves outside the Git repository is rejected before its content is read.
- Context Markdown is decoded as UTF-8, a leading byte-order mark is removed, and line endings are normalized to LF. Empty canonical files produce warnings; missing files produce errors.
- Adapters will receive the resolved object. They will not parse AgentFold YAML, select canonical files, or use the filesystem abstraction to load project context.

## Consequences

All future adapters share one deterministic interpretation of project context and one repository-boundary policy. Doctor can report the same failures an adapter would encounter without duplicating parsing logic. The resolver performs only fixed, shallow reads and configured-path existence checks; it does not recursively load source or documentation, follow Markdown references, inspect environment files, or generate adapter output.
