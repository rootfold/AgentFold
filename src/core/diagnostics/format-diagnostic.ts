import { createColors } from "picocolors";

import type { Diagnostic, DiagnosticSeverity } from "./diagnostic.js";

export interface FormatDiagnosticOptions {
  readonly color?: boolean;
}

const statusBySeverity: Record<
  DiagnosticSeverity,
  { readonly label: string; readonly symbol: string }
> = {
  info: { label: "info", symbol: "ℹ" },
  success: { label: "passed", symbol: "✓" },
  warning: { label: "warning", symbol: "⚠" },
  error: { label: "failed", symbol: "✗" },
};

export function formatDiagnostic(
  diagnostic: Diagnostic,
  options: FormatDiagnosticOptions = {},
): string {
  const colors = createColors(options.color ?? false);
  const status = statusBySeverity[diagnostic.severity];
  const styleStatus: Record<DiagnosticSeverity, (value: string) => string> = {
    info: colors.blue,
    success: colors.green,
    warning: colors.yellow,
    error: colors.red,
  };
  const prefix = styleStatus[diagnostic.severity](`${status.symbol} ${status.label}`);
  const firstLine = `${prefix} ${colors.dim(`[${diagnostic.code}]`)} ${diagnostic.message}`;

  if (diagnostic.suggestion === undefined) {
    return firstLine;
  }

  return `${firstLine}\n  ${colors.dim("Suggestion:")} ${diagnostic.suggestion}`;
}
