import { z } from "zod";

import type { Diagnostic } from "../../core/diagnostics/diagnostic.js";

export const agentFoldServiceProtocolVersion = 1 as const;
export const maximumServiceMessageBytes = 1024 * 1024;

export const serviceMethodNames = [
  "service.ping",
  "service.status",
  "service.shutdown",
  "session.open",
  "session.heartbeat",
  "session.detach",
  "session.close",
  "integration.get_status",
  "integration.get_context",
  "integration.begin_task",
  "integration.report_progress",
  "integration.create_checkpoint",
  "integration.get_resume_packet",
] as const;

export type ServiceMethodName = (typeof serviceMethodNames)[number];

const serviceRequestBoundarySchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    token: z.string().min(1).max(1_024),
    method: z.string().trim().min(1).max(200),
    params: z.unknown(),
    protocolVersion: z.number().int(),
  })
  .strict();

export const serviceRequestSchema = serviceRequestBoundarySchema.extend({
  method: z.enum(serviceMethodNames),
  protocolVersion: z.literal(agentFoldServiceProtocolVersion),
});

export interface ServiceRequest {
  readonly id: string;
  readonly token: string;
  readonly method: ServiceMethodName;
  readonly params: unknown;
  readonly protocolVersion: typeof agentFoldServiceProtocolVersion;
}

export interface ServiceResponseError {
  readonly code: string;
  readonly message: string;
  readonly diagnostics?: readonly Diagnostic[];
}

export type ServiceResponse =
  | {
      readonly id: string;
      readonly ok: true;
      readonly result: unknown;
      readonly protocolVersion: typeof agentFoldServiceProtocolVersion;
    }
  | {
      readonly id: string;
      readonly ok: false;
      readonly error: ServiceResponseError;
      readonly protocolVersion: typeof agentFoldServiceProtocolVersion;
    };

export const serviceResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      id: z.string(),
      ok: z.literal(true),
      result: z.unknown(),
      protocolVersion: z.literal(agentFoldServiceProtocolVersion),
    })
    .strict(),
  z
    .object({
      id: z.string(),
      ok: z.literal(false),
      error: z
        .object({
          code: z.string(),
          message: z.string(),
          diagnostics: z.array(z.unknown()).optional(),
        })
        .strict(),
      protocolVersion: z.literal(agentFoldServiceProtocolVersion),
    })
    .strict(),
]);

export type ServiceRequestBoundary = z.infer<typeof serviceRequestBoundarySchema>;

export function parseServiceRequestBoundary(input: unknown) {
  return serviceRequestBoundarySchema.safeParse(input);
}

export function parseServiceRequest(input: unknown) {
  return serviceRequestSchema.safeParse(input);
}

export function serviceSuccess(id: string, result: unknown): ServiceResponse {
  return { id, ok: true, result, protocolVersion: agentFoldServiceProtocolVersion };
}

export function serviceFailure(
  id: string,
  code: string,
  message: string,
  diagnostics?: readonly Diagnostic[],
): ServiceResponse {
  return {
    id,
    ok: false,
    error: { code, message, ...(diagnostics === undefined ? {} : { diagnostics }) },
    protocolVersion: agentFoldServiceProtocolVersion,
  };
}
