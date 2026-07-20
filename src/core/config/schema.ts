import { z } from "zod";

const nonEmptyString = z.string().trim().min(1, "Must not be empty");

const projectSchema = z
  .object({
    name: nonEmptyString.max(100, "Must be 100 characters or fewer"),
    summary: nonEmptyString.max(1_000, "Must be 1000 characters or fewer"),
  })
  .strict();

const runtimeSchema = z
  .object({
    node: nonEmptyString.max(100, "Must be 100 characters or fewer"),
  })
  .strict();

const commandsSchema = z
  .record(z.string().regex(/^[a-z][a-z0-9:_-]*$/u, "Must be a valid command name"), nonEmptyString)
  .refine((commands) => Object.keys(commands).length > 0, "At least one command is required");

const stateSchema = z
  .object({
    visibility: z.enum(["local", "tracked"]),
  })
  .strict();

const safetySchema = z
  .object({
    respect_gitignore: z.boolean(),
    excluded_paths: z.array(nonEmptyString).default([]),
  })
  .strict();

const adapterOptionsSchema = z.record(nonEmptyString, z.unknown());

export const agentFoldConfigSchema = z
  .object({
    version: z.literal(1),
    project: projectSchema,
    runtime: runtimeSchema,
    package_manager: z.enum(["pnpm", "npm", "yarn", "bun"]),
    commands: commandsSchema,
    state: stateSchema,
    safety: safetySchema,
    adapters: z.record(nonEmptyString, adapterOptionsSchema).optional(),
  })
  .strict();
