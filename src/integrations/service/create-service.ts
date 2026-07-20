import net, { type Server, type Socket } from "node:net";

import { capabilityTokensEqual } from "./authentication.js";
import { ServiceMethodError } from "./service-coordinator.js";
import type { AgentFoldServiceCoordinator } from "./service-coordinator.js";
import {
  agentFoldServiceProtocolVersion,
  maximumServiceMessageBytes,
  parseServiceRequest,
  parseServiceRequestBoundary,
  serviceFailure,
  serviceSuccess,
  type ServiceResponse,
} from "./service-protocol.js";

export interface CreateAgentFoldServiceInput {
  readonly endpoint: string;
  readonly token: string;
  readonly coordinator: AgentFoldServiceCoordinator;
  readonly readTimeoutMilliseconds?: number;
  readonly operationTimeoutMilliseconds?: number;
  readonly maximumMessageBytes?: number;
  readonly createServer?: (connectionListener: (socket: Socket) => void) => Server;
}

export interface AgentFoldLocalService {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly closed: Promise<void>;
}

function requestId(input: unknown): string {
  return typeof input === "object" &&
    input !== null &&
    "id" in input &&
    typeof input.id === "string"
    ? input.id
    : "unknown";
}

function withTimeout<Result>(operation: Promise<Result>, milliseconds: number): Promise<Result> {
  return new Promise((resolve, reject) => {
    const handle = setTimeout(
      () => reject(new ServiceMethodError("AFSV017", "The service operation timed out.")),
      milliseconds,
    );
    operation.then(
      (result) => {
        clearTimeout(handle);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(handle);
        reject(error);
      },
    );
  });
}

export function createAgentFoldService(input: CreateAgentFoldServiceInput): AgentFoldLocalService {
  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  let stopping = false;
  const sockets = new Set<Socket>();
  const maximumBytes = input.maximumMessageBytes ?? maximumServiceMessageBytes;
  const operationTimeout = input.operationTimeoutMilliseconds ?? 30_000;

  const respond = (socket: Socket, response: ServiceResponse): void => {
    if (socket.destroyed) return;
    const serialized = JSON.stringify(response);
    socket.end(
      Buffer.byteLength(serialized, "utf8") <= maximumBytes
        ? serialized
        : JSON.stringify(
            serviceFailure(response.id, "AFSV010", "The service response is too large."),
          ),
    );
  };

  const handlePayload = async (socket: Socket, source: string): Promise<void> => {
    let value: unknown;
    try {
      value = JSON.parse(source.replace(/^\uFEFF/u, ""));
    } catch {
      respond(
        socket,
        serviceFailure("unknown", "AFSV011", "The service request is not valid JSON."),
      );
      return;
    }
    const id = requestId(value);
    const boundary = parseServiceRequestBoundary(value);
    if (!boundary.success) {
      const token =
        typeof value === "object" && value !== null && "token" in value ? value.token : undefined;
      respond(
        socket,
        typeof token === "string"
          ? serviceFailure(id, "AFSV011", "The service request shape is invalid.")
          : serviceFailure(id, "AFSV009", "The service request could not be authenticated."),
      );
      return;
    }
    if (!capabilityTokensEqual(input.token, boundary.data.token)) {
      respond(
        socket,
        serviceFailure(id, "AFSV009", "The service request could not be authenticated."),
      );
      return;
    }
    if (boundary.data.protocolVersion !== agentFoldServiceProtocolVersion) {
      respond(
        socket,
        serviceFailure(id, "AFSV012", "The service protocol version is unsupported."),
      );
      return;
    }
    const request = parseServiceRequest(value);
    if (!request.success) {
      const knownMethod = request.error.issues.every((issue) => issue.path[0] !== "method");
      respond(
        socket,
        serviceFailure(
          id,
          knownMethod ? "AFSV011" : "AFSV012",
          knownMethod ? "The service request is invalid." : "The service method is unsupported.",
        ),
      );
      return;
    }
    try {
      const result = await withTimeout(
        input.coordinator.handle(request.data.method, request.data.params),
        operationTimeout,
      );
      respond(socket, serviceSuccess(id, input.coordinator.sanitizeResult(result)));
    } catch (error: unknown) {
      const expected = error instanceof ServiceMethodError;
      respond(
        socket,
        serviceFailure(
          id,
          expected ? error.code : "AFSV028",
          expected ? error.message : "The service could not complete the request safely.",
          expected && error.diagnostics.length > 0 ? error.diagnostics : undefined,
        ),
      );
    }
  };

  const server = (input.createServer ?? ((listener) => net.createServer(listener)))((socket) => {
    sockets.add(socket);
    let size = 0;
    const chunks: Buffer[] = [];
    let handled = false;
    socket.setTimeout(input.readTimeoutMilliseconds ?? 5_000, () => {
      if (handled) return;
      handled = true;
      respond(socket, serviceFailure("unknown", "AFSV017", "The service request timed out."));
    });
    socket.on("data", (chunk: Buffer) => {
      if (handled) return;
      size += chunk.length;
      if (size > maximumBytes) {
        handled = true;
        respond(socket, serviceFailure("unknown", "AFSV010", "The service request is too large."));
        return;
      }
      chunks.push(chunk);
      const buffered = Buffer.concat(chunks).toString("utf8");
      const newline = buffered.indexOf("\n");
      if (newline >= 0) {
        handled = true;
        socket.setTimeout(0);
        const trailing = buffered.slice(newline + 1);
        if (trailing.trim().length > 0) {
          respond(
            socket,
            serviceFailure(
              "unknown",
              "AFSV011",
              "Only one service request is allowed per connection.",
            ),
          );
          return;
        }
        void handlePayload(socket, buffered.slice(0, newline));
      }
    });
    socket.on("end", () => {
      if (handled) return;
      handled = true;
      socket.setTimeout(0);
      void handlePayload(socket, Buffer.concat(chunks).toString("utf8"));
    });
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
  });
  server.on("close", () => resolveClosed?.());

  return {
    closed,
    start: () =>
      new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => reject(error);
        server.once("error", onError);
        server.listen(input.endpoint, () => {
          server.off("error", onError);
          resolve();
        });
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        if (stopping) {
          void closed.then(resolve);
          return;
        }
        stopping = true;
        server.close(() => resolve());
        if (!server.listening) {
          resolveClosed?.();
          resolve();
        }
      }),
  };
}
