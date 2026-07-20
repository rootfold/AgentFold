export { ConfigValidationError, parseConfig } from "./core/config/parse-config.js";
export { agentFoldConfigSchema } from "./core/config/schema.js";
export type { AgentFoldConfig } from "./core/config/types.js";
export type { Diagnostic, DiagnosticSeverity } from "./core/diagnostics/diagnostic.js";
export { formatDiagnostic } from "./core/diagnostics/format-diagnostic.js";
export type { FileSystem } from "./core/filesystem/filesystem.js";
export { NodeFileSystem } from "./core/filesystem/node-filesystem.js";
