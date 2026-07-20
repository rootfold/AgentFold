# Local MCP integration

`agentfold mcp` exposes the existing AgentFold continuity engine to MCP-capable desktop applications, IDEs, and coding agents. It runs locally over stdio: there is no network listener, telemetry, source upload, remote service, or AI model call.

## Available tools

- `agentfold_get_status` reads initialization, active-task, and checkpoint status.
- `agentfold_get_context` returns bounded canonical project context.
- `agentfold_open_session` creates minimal in-memory lifecycle metadata and returns project or continuation status.
- `agentfold_begin_task` creates validated active-task state.
- `agentfold_report_progress` validates, redacts, and merges structured semantic progress.
- `agentfold_create_checkpoint` captures bounded Git facts and immutable semantic state.
- `agentfold_get_resume_packet` reads a deterministic JSON or Markdown continuation packet.
- `agentfold_close_session` optionally reports, checkpoints, returns a resume packet, and marks the in-memory session closed.

The recommended lifecycle is open session, continue a matching active task or explicitly begin a requested new task, report meaningful progress, and close the session before returning control or switching agents. Reports contain concise engineering conclusions—not private chain of thought, secrets, full conversations, or terminal transcripts.

One MCP process serves exactly one Git repository. The workspace is fixed at startup, tools cannot switch it, and normal results contain only repository-relative paths. AgentFold never stages, commits, resets, stashes, pushes, creates branches, edits hooks, or changes remotes.

## Run locally

During development:

```bash
pnpm agentfold mcp --workspace .
```

From a production build:

```bash
node dist/cli.js mcp --workspace /absolute/path/to/project
```

An installed package uses the existing binary:

```bash
agentfold mcp --workspace /absolute/path/to/project
```

Add `--debug` for safe lifecycle messages on standard error. Standard output remains exclusively MCP JSON-RPC traffic. `NO_COLOR` is respected by the surrounding CLI, and MCP protocol results never include ANSI formatting.

## Generic host configuration

Host application configuration formats vary. This unverified generic example illustrates the command shape only:

```json
{
  "mcpServers": {
    "agentfold": {
      "command": "agentfold",
      "args": ["mcp", "--workspace", "/absolute/path/to/project"]
    }
  }
}
```

For an AgentFold development checkout after `pnpm build`:

```json
{
  "mcpServers": {
    "agentfold": {
      "command": "node",
      "args": [
        "/absolute/path/to/AgentFold/dist/cli.js",
        "mcp",
        "--workspace",
        "/absolute/path/to/project"
      ]
    }
  }
}
```

Do not assume either snippet matches a particular application without checking that host's supported MCP configuration mechanism.

## Current limitations

Session metadata is intentionally in memory and is lost when the process ends. Shutdown does not create an automatic report or checkpoint. Applications must call the lifecycle tools; unexpected termination can recover only the latest durable AgentFold state and checkpoint. There is no daemon, watcher, crash-recovery monitor, HTTP transport, authentication layer, application configuration installer, or application-specific Antigravity, Codex, or IDE connector yet.
