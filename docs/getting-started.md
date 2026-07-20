# Getting started

AgentFold currently supports safe initialization, canonical project diagnostics, active-task reports, immutable checkpoints, continuation packets, and a local MCP boundary. Run it from any directory inside an existing Git repository.

## Preview initialization

```bash
pnpm agentfold init --dry-run
```

This resolves the repository root, scans safe root-level metadata, reports existing agent instruction files, and lists the canonical files that would be created. It does not write anything. Running `pnpm agentfold init` without an option is also a conservative preview and tells you to re-run with `--yes`.

## Initialize non-interactively

```bash
pnpm agentfold init --yes
```

This creates:

```text
.agentfold/
├── config.yaml
├── context/
│   ├── project.md
│   ├── architecture.md
│   ├── commands.md
│   ├── conventions.md
│   └── safety.md
└── manifest.json
```

Initialization never overwrites an existing canonical file. If `.agentfold/config.yaml` already exists, the command reports the installation and exits without writing. A partial `.agentfold` directory is reported as a conflict for manual review. Existing `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Copilot instructions, and Cursor rules are detected but left untouched.

Initialization records only known top-level directories that actually exist. A detected configuration can include:

```yaml
paths:
  source:
    - src
  tests:
    - tests
  documentation:
    - docs
  generated:
    - dist
    - coverage
```

Each category is optional. Paths use forward slashes, remain relative to the Git repository, and are normalized and deduplicated during validation. Absolute paths and parent traversal are invalid. A configured path may be created later, but `doctor` warns while it does not exist.

## Check project health

```bash
pnpm agentfold doctor
```

The current doctor checks Git repository presence and `README.md`, then resolves the canonical project context through the same loader future adapters will use. It reports invalid YAML or schema values, missing or empty context files, unsafe paths, and configured paths that do not exist. It does not modify files.

Canonical AgentFold files are intended to be tracked. Initialization does not edit `.gitignore`; future local task state can be ignored separately.

## Start an active task

Previewing is the default and writes nothing:

```bash
pnpm agentfold start "Implement GitHub OAuth"
```

Create the active task non-interactively:

```bash
pnpm agentfold start "Implement GitHub OAuth" --agent codex --yes
```

This atomically creates `.agentfold/state/current.md`. It records a repository-relative working context, the current branch and HEAD commit, and an explicit `null` commit when the repository has no commits. It never creates a branch, stages files, or commits changes. An existing active task is never replaced.

When `state.visibility` is `local`, AgentFold warns if `.agentfold/state/` is not ignored. Add only this path when local task state should remain untracked:

```gitignore
.agentfold/state/
```

AgentFold does not edit `.gitignore` automatically.

## Submit a structured agent report

Create `report.json`:

```json
{
  "agent": "codex",
  "completed": ["Added the GitHub OAuth callback route"],
  "decisions": [
    {
      "decision": "Reuse the existing session table",
      "reason": "Avoid changing the existing authentication model"
    }
  ],
  "nextActions": ["Fix the callback integration test"]
}
```

PowerShell:

```powershell
Get-Content .\report.json -Raw | pnpm agentfold report --stdin
```

macOS, Linux, and other shells with `cat`:

```bash
cat report.json | pnpm agentfold report --stdin
```

Use `--agent codex` to supply an omitted agent or explicitly override the JSON `agent` field. Reports append and deduplicate semantic progress; they do not replace earlier conclusions. Validation commands are stored as reported text and are never executed.

AgentFold redacts likely secrets before persistence, but developers and coding agents should not submit secrets, private reasoning, complete conversations, or transcripts. Future agent integrations can submit this report structure automatically without exposing private conversations.

## Create an immutable checkpoint

Capture the active task, its previously reported semantic progress, and the current Git facts:

```bash
pnpm agentfold checkpoint
```

Checkpointing persists by default. Use `--dry-run` to capture and preview the same facts without creating history or updating active state:

```bash
pnpm agentfold checkpoint --dry-run
```

An integration can identify itself independently of the last semantic reporting agent:

```bash
pnpm agentfold checkpoint --agent codex
```

Git branch, HEAD, staged and unstaged status, repository-relative changed paths, aggregate numstat totals, and recent commit subjects are collected automatically. A path changed in both the index and working tree is counted once as a file, while its two Git numstat layers are summed; these are aggregate layer totals rather than a stored combined diff. Binary paths are counted without line totals. Semantic conclusions come only from earlier `report --stdin` submissions. A Git-only checkpoint is allowed with a warning; AgentFold does not infer decisions, blockers, failures, or next actions from a diff.

History is stored under `.agentfold/state/history/` as deterministic Markdown with YAML front matter. Observed Git facts and agent-reported conclusions remain visibly separate. Checkpoints contain no full diff, source-file content, environment values, terminal transcript, or private reasoning. Untracked files are named but their contents and line counts are not inspected.

Checkpointing never stages or commits files. Running it again without a meaningful Git or semantic change leaves both history and active state byte-for-byte unchanged.

## Resume from a checkpoint

Render the latest immutable checkpoint for the active task as Markdown on standard output:

```bash
pnpm agentfold resume
```

Add a small Codex-specific hint, serialize the typed packet as JSON, select a historical checkpoint, or atomically create an output file:

```bash
pnpm agentfold resume --for codex
pnpm agentfold resume --format json
pnpm agentfold resume --checkpoint CP-001
pnpm agentfold resume --output handoff.md
```

Resume follows active-state checkpoint metadata and validates the selected immutable history file. A historical checkpoint can be selected explicitly and is marked as not latest. The command does not rerun Git discovery, read source files, or include complete diffs. Automatically observed Git facts remain separate from earlier agent-reported conclusions, and reused or absent semantic reports are labeled explicitly.

Markdown is intended for pasting into a fresh coding-agent session. JSON contains the same bounded `ResumePacket` data for future integrations, with diagnostics kept on standard error. Target options add only a display and instruction-file hint; they do not generate or modify agent instructions. Relative output paths are resolved from the repository root, parent directories may be created inside that boundary, and existing files are never overwritten. A mismatched output extension produces a warning but the requested filename is preserved.

The continuation packet asks the receiving agent to submit concise structured conclusions before ending. Future work may automate report and checkpoint invocation, but resume itself has no adapters, managed processes, watchers, Git hooks, network calls, or model integration.

## Run the local MCP server

Start one stdio MCP process for the containing Git repository:

```bash
pnpm agentfold mcp --workspace .
```

The server lets a compatible host open a session, read bounded context, begin a task, report progress, checkpoint, resume, and close the session through the same validated core used by the CLI commands. It has no network listener and writes protocol messages only to standard output. Safe debug lifecycle messages are available with `--debug` on standard error.

See [Local MCP integration](integrations/mcp.md) for the tool lifecycle, generic manual configuration examples, security boundary, and current limitations. No application-specific configuration is installed automatically.
