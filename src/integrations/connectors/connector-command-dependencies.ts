import type { AntigravityConnectorDependencies } from "./antigravity/antigravity-connector.js";
import type { CodexConnectorDependencies } from "./codex/codex-connector.js";

export interface ConnectorCommandDependencies {
  readonly antigravity: AntigravityConnectorDependencies;
  readonly codex: CodexConnectorDependencies;
}
