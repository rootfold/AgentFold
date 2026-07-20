# Local MCP integration

`agentfold mcp` exposes the existing AgentFold continuity engine to MCP-capable desktop applications, IDEs, and coding agents. MCP itself runs locally over stdio: there is no public network listener, telemetry, source upload, remote service, or AI model call. It can delegate to the authenticated [shared local service](../service.md) over a named pipe or Unix-domain socket.

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

Service selection defaults to `auto`:

```bash
pnpm agentfold mcp --workspace . --service auto
pnpm agentfold mcp --workspace . --service required
pnpm agentfold mcp --workspace . --service disabled
```

`auto` chooses the service only at startup and warns on stderr before embedded fallback. `required` is intended for future installed connectors. `disabled` preserves the original per-process in-memory session behavior. A lost service connection never triggers a mid-session fallback.

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

Service session metadata remains intentionally in memory and is lost on service restart. Shutdown does not create a report or checkpoint solely because the process is stopping. There is no watcher, HTTP transport, operating-system service installer, application configuration installer, or application-specific Antigravity, Codex, or IDE connector yet. Embedded mode still has per-process sessions and no cross-application automation.
