import type { CanonicalContextFailure } from "../context/types.js";

export function canonicalContextFailureExitCode(result: CanonicalContextFailure): number {
  if (result.diagnostics.some((diagnostic) => diagnostic.code === "AFC001")) {
    return 6;
  }

  if (
    result.diagnostics.some((diagnostic) =>
      ["AFC003", "AFC004", "AFC007", "AFC010"].includes(diagnostic.code),
    )
  ) {
    return 2;
  }

  return 1;
}
