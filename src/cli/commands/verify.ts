import type { Command } from "commander";

import { formatDiagnostic } from "../../core/diagnostics/format-diagnostic.js";
import { resolveAgentFoldLaunchDescriptor } from "../../integrations/connectors/executable-descriptor.js";
import { verifyAntigravityConnection } from "../../integrations/connectors/antigravity/antigravity-verification.js";
import type { AntigravityConnectorDependencies } from "../../integrations/connectors/antigravity/antigravity-connector.js";
import { CliCommandError } from "../command-error.js";
import type { CliOutput } from "../output/cli-output.js";
import { writeLine } from "../output/cli-output.js";

export function registerVerifyCommand(
  program: Command,
  dependencies: AntigravityConnectorDependencies,
  output: CliOutput,
): void {
  program
    .command("verify")
    .description("Verify a host connector without modifying host configuration")
    .argument("<host>", "host connector name")
    .action(async (host: string) => {
      if (host !== "antigravity") {
        writeLine(output, `Unsupported connector host: ${host}`);
        throw new CliCommandError(2, "Unsupported connector host");
      }
      const result = await (dependencies.verifyConnection ?? verifyAntigravityConnection)({
        fileSystem: dependencies.fileSystem,
        gitRepositoryLocator: dependencies.gitRepositoryLocator,
        version: dependencies.version,
        ...(dependencies.platform === undefined ? {} : { platform: dependencies.platform }),
        ...(dependencies.stateDirectory === undefined
          ? {}
          : { stateDirectory: dependencies.stateDirectory }),
        ...(dependencies.runtimeDirectory === undefined
          ? {}
          : { runtimeDirectory: dependencies.runtimeDirectory }),
        resolveDescriptor: () =>
          (dependencies.resolveLaunchDescriptor ?? resolveAgentFoldLaunchDescriptor)({
            fileSystem: dependencies.fileSystem,
            processRunner: dependencies.processRunner,
            ...(dependencies.executable === undefined
              ? {}
              : { executable: dependencies.executable }),
            ...(dependencies.modulePath === undefined
              ? {}
              : { modulePath: dependencies.modulePath }),
            ...(dependencies.allowTemporaryLaunchPath === undefined
              ? {}
              : { allowTemporaryPath: dependencies.allowTemporaryLaunchPath }),
          }),
        ...(dependencies.launchMcp === undefined ? {} : { launchMcp: dependencies.launchMcp }),
        ...(dependencies.environment === undefined
          ? {}
          : { environment: dependencies.environment }),
      });
      writeLine(output, "AgentFold Antigravity verification");
      writeLine(output);
      for (const item of result.diagnostics) {
        writeLine(output, formatDiagnostic(item, { color: output.useColor }));
      }
      if (!result.valid)
        throw new CliCommandError(result.exitCode, "Connector verification failed");
      writeLine(output, `Tools: ${result.toolsAvailable}`);
      writeLine(output, `Shared service: ${result.serviceAvailable ? "available" : "unavailable"}`);
      writeLine(output);
      writeLine(
        output,
        "Open Antigravity Settings > Customizations, refresh Installed MCP Servers,",
      );
      writeLine(
        output,
        "confirm `agentfold` appears, inspect its tools, and approve them when prompted.",
      );
    });
}
