import { z } from "zod";

export const workspaceModes = ["fixed", "auto", "roots", "cwd"] as const;
export const workspaceModeSchema = z.enum(workspaceModes);
export type WorkspaceMode = z.infer<typeof workspaceModeSchema>;
