import { stringify as stringifyYaml } from "yaml";

import { parseConfig } from "./parse-config.js";
import type { AgentFoldConfig } from "./types.js";

export function serializeConfig(config: AgentFoldConfig): string {
  return stringifyYaml(parseConfig(config), {
    indent: 2,
    lineWidth: 0,
  });
}
