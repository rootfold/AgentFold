import { stringify as stringifyYaml } from "yaml";

import type { AgentFoldConfig } from "./types.js";

export function serializeConfig(config: AgentFoldConfig): string {
  return stringifyYaml(config, {
    indent: 2,
    lineWidth: 0,
  });
}
