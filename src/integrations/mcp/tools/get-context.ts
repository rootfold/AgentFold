import { loadCanonicalContext } from "../../../core/context/load-context.js";
import { containsSecretLikeText } from "../../../core/reports/redact-secrets.js";
import type { CanonicalContextDocuments } from "../../../core/context/types.js";
import type { AgentFoldMcpApplicationContext } from "../mcp-context.js";
import { mcpFailure, mcpSuccess, type AgentFoldMcpResult } from "../mcp-response.js";
import { agentFoldMcpToolNames } from "../tool-names.js";
import { getContextInputSchema } from "../tool-schemas.js";
import { parseToolInput } from "./shared.js";

const totalDocumentBudget = 20_000;
const conciseExcerptBudget = 2_000;
const documentOrder: readonly (keyof CanonicalContextDocuments)[] = [
  "project",
  "architecture",
  "commands",
  "conventions",
  "safety",
];

function boundedDocuments(documents: CanonicalContextDocuments) {
  let remaining = totalDocumentBudget;
  const content: Partial<Record<keyof CanonicalContextDocuments, string>> = {};
  const omittedCharacters: Record<keyof CanonicalContextDocuments, number> = {
    project: 0,
    architecture: 0,
    commands: 0,
    conventions: 0,
    safety: 0,
  };
  for (const name of documentOrder) {
    const included = documents[name].slice(0, remaining);
    content[name] = included;
    omittedCharacters[name] = documents[name].length - included.length;
    remaining -= included.length;
  }
  return { content, omittedCharacters, totalIncludedCharacters: totalDocumentBudget - remaining };
}

export async function getContext(
  context: AgentFoldMcpApplicationContext,
  input: unknown,
): Promise<AgentFoldMcpResult> {
  const operation = agentFoldMcpToolNames.getContext;
  const parsed = parseToolInput(operation, getContextInputSchema, input);
  if (!parsed.success) return parsed.result;
  const loaded = await loadCanonicalContext({
    fileSystem: context.fileSystem,
    gitRepositoryLocator: context.gitRepositoryLocator,
    startDirectory: context.repositoryRoot,
  });
  if (loaded.status === "error")
    return mcpFailure(operation, "invalid_context", loaded.diagnostics);
  const canonical = loaded.context;
  const selected = parsed.data.includeContextDocuments
    ? documentOrder.map((name) => canonical.context[name]).join("\n")
    : `${canonical.context.architecture}\n${canonical.context.conventions}`;
  if (containsSecretLikeText(selected)) {
    return mcpFailure(operation, "unsafe_context", [
      {
        code: "AFMCP014",
        severity: "error",
        message: "Secret-like content was detected in canonical context selected for return.",
        suggestion: "Remove or redact sensitive values from canonical context files.",
      },
    ]);
  }
  const documents = parsed.data.includeContextDocuments
    ? boundedDocuments(canonical.context)
    : undefined;
  return mcpSuccess(
    operation,
    "valid_context",
    {
      project: canonical.project,
      runtime: canonical.runtime,
      ...(canonical.packageManager === undefined
        ? {}
        : { packageManager: canonical.packageManager }),
      commands: canonical.commands,
      paths: canonical.paths,
      safety: canonical.safety,
      state: canonical.state,
      enabledAdapters: canonical.enabledAdapters,
      architectureExcerpt: canonical.context.architecture.slice(0, conciseExcerptBudget),
      conventionsExcerpt: canonical.context.conventions.slice(0, conciseExcerptBudget),
      ...(documents === undefined ? {} : { contextDocuments: documents }),
    },
    loaded.diagnostics,
  );
}
