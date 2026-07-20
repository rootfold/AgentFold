import { describe, expect, it, vi } from "vitest";

import { McpHeartbeatManager } from "../../src/integrations/mcp/heartbeat-manager.js";
import type { AgentFoldServiceClient } from "../../src/integrations/service/service-client.js";
import type { ServiceScheduler } from "../../src/integrations/service/lease-monitor.js";

describe("MCP heartbeat manager", () => {
  it("starts, heartbeats, stops, and detaches without inventing a report", async () => {
    let callback: (() => void) | undefined;
    const cleared: unknown[] = [];
    const scheduler: ServiceScheduler = {
      setInterval(next) {
        callback = next;
        return "timer";
      },
      clearInterval(handle) {
        cleared.push(handle);
      },
    };
    const heartbeat = vi.fn(() => Promise.resolve({ leaseExpiresAt: "later" }));
    const detach = vi.fn(() => Promise.resolve());
    const client = { heartbeat, detach } as unknown as AgentFoldServiceClient;
    const errors: string[] = [];
    const manager = new McpHeartbeatManager({
      client,
      scheduler,
      logger: { debug: () => undefined, error: (message) => errors.push(message) },
    });
    manager.start("session-1", 20);
    callback?.();
    await Promise.resolve();
    expect(heartbeat).toHaveBeenCalledWith("session-1");
    await manager.shutdown();
    expect(detach).toHaveBeenCalledWith("session-1");
    expect(cleared).toEqual(["timer"]);
    expect(errors).toEqual([]);
    expect(JSON.stringify(heartbeat.mock.calls)).not.toMatch(/report|checkpoint/iu);
  });

  it("reports heartbeat errors only through the safe logger", async () => {
    let callback: (() => void) | undefined;
    const errors: string[] = [];
    const manager = new McpHeartbeatManager({
      client: {
        heartbeat: () => Promise.reject(new Error("private failure")),
        detach: () => Promise.resolve(),
      } as unknown as AgentFoldServiceClient,
      scheduler: {
        setInterval(next) {
          callback = next;
          return 1;
        },
        clearInterval: () => undefined,
      },
      logger: { debug: () => undefined, error: (message) => errors.push(message) },
    });
    manager.start("session-2", 20);
    callback?.();
    await new Promise((resolve) => setImmediate(resolve));
    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toContain("private failure");
    await manager.shutdown();
  });
});
