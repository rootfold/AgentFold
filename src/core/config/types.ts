import type { z } from "zod";

import type { agentFoldConfigSchema } from "./schema.js";

export type AgentFoldConfig = z.infer<typeof agentFoldConfigSchema>;
