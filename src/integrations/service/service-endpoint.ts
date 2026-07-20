import { createHash } from "node:crypto";
import path from "node:path";

import type { ServiceEndpointKind } from "./service-types.js";

export function safeRuntimeIdentifier(runtimeDirectory: string): string {
  return createHash("sha256")
    .update(runtimeDirectory.replaceAll("\\", "/").replace(/\/+$/u, ""), "utf8")
    .digest("hex")
    .slice(0, 20);
}

export function createServiceEndpoint(
  runtimeDirectory: string,
  endpointKind: ServiceEndpointKind,
): string {
  const identifier = safeRuntimeIdentifier(runtimeDirectory);
  return endpointKind === "named-pipe"
    ? `\\\\.\\pipe\\agentfold-${identifier}`
    : path.posix.join(runtimeDirectory.replaceAll("\\", "/"), `service-${identifier}.sock`);
}
