# Getting started

AgentFold currently supports safe initialization and basic project diagnostics. Run it from any directory inside an existing Git repository.

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

## Check project health

```bash
pnpm agentfold doctor
```

The current doctor checks Git repository presence, `README.md`, installation completeness, YAML syntax, and the configuration schema. It does not modify files.

Canonical AgentFold files are intended to be tracked. Initialization does not edit `.gitignore`; future local task state can be ignored separately.
