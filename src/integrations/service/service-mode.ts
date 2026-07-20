import { z } from "zod";

export const serviceModes = ["auto", "required", "disabled"] as const;
export const serviceModeSchema = z.enum(serviceModes);
export type ServiceMode = z.infer<typeof serviceModeSchema>;
