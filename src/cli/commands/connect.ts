import { Option, type Command } from "commander";

import { formatDiagnostic } from "../../core/diagnostics/format-diagnostic.js";
import {
  applyAntigravityConnection,
  prepareAntigravityConnection,
  type AntigravityConnectorDependencies,
} from "../../integrations/connectors/antigravity/antigravity-connector.js";
import {
  connectorSurfaces,
  type ConnectorSurface,
} from "../../integrations/connectors/connector-types.js";
import { CliCommandError } from "../command-error.js";
import type { CliOutput } from "../output/cli-output.js";
import { writeLine } from "../output/cli-output.js";

interface ConnectOptions {
  readonly dryRun?: boolean;
  readonly yes?: boolean;
  readonly surface: ConnectorSurface;
}

function validateHost(host: string, output: CliOutput): void {
  if (host === "antigravity") return;
  writeLine(
    output,
    formatDiagnostic(
      {
        code: "AFCN000",
        severity: "error",
        message: `Unsupported connector host: ${host}`,
        suggestion: "The only supported host is antigravity.",
      },
      { color: output.useColor },
    ),
  );
  throw new CliCommandError(2, "Unsupported connector host");
}

export function registerConnectCommand(
  program: Command,
  dependencies: AntigravityConnectorDependencies,
  output: CliOutput,
): void {
  program
    .command("connect")
    .description("Preview or install a safe host connector")
    .argument("<host>", "host connector name")
    .addOption(new Option("--dry-run", "preview without writing files").conflicts("yes"))
    .addOption(new Option("--yes", "apply the validated plan").conflicts("dryRun"))
    .addOption(
      new Option("--surface <surface>", "Antigravity surface")
        .choices([...connectorSurfaces])
        .default("auto"),
    )
    .action(async (host: string, options: ConnectOptions) => {
      validateHost(host, output);
      const plan = await prepareAntigravityConnection(dependencies, options.surface);
      writeLine(output, "AgentFold Antigravity connector");
      writeLine(output);
      for (const item of plan.diagnostics) {
        writeLine(output, formatDiagnostic(item, { color: output.useColor }));
      }
      if (!plan.safe) throw new CliCommandError(plan.exitCode, "Connector planning failed");
      writeLine(output);
      writeLine(output, "Planned changes");
      if (plan.actions.length === 0) writeLine(output, "  No changes required");
      for (const action of plan.actions) {
        writeLine(output, `  ${action.description}`);
        writeLine(output, `    ${action.target}`);
      }
      writeLine(output);
      writeLine(output, "MCP launch");
      writeLine(
        output,
        "  agentfold mcp --service required --ensure-service --workspace-mode auto",
      );
      writeLine(output);
      if (options.yes !== true) {
        writeLine(
          output,
          options.dryRun === true
            ? "Dry run complete. No files were changed."
            : "No files were changed. Run again with --yes to apply this plan.",
        );
        return;
      }
      const result = await applyAntigravityConnection(plan, dependencies);
      for (const item of result.diagnostics) {
        writeLine(output, formatDiagnostic(item, { color: output.useColor }));
      }
      if (result.exitCode !== 0)
        throw new CliCommandError(result.exitCode, "Connector install failed");
      writeLine(output);
      writeLine(output, "AgentFold runs locally over stdio and authenticated local IPC.");
      writeLine(
        output,
        "In Antigravity, refresh Installed MCP Servers, inspect `agentfold`, and approve tools when requested.",
      );
    });
}
