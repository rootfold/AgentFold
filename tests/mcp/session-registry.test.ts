import { describe, expect, it } from "vitest";

import { InMemorySessionRegistry } from "../../src/integrations/mcp/session-registry.js";

function clock(...timestamps: string[]): () => Date {
  let index = 0;
  return () => new Date(timestamps[Math.min(index++, timestamps.length - 1)] ?? 0);
}

describe("MCP session registry", () => {
  it("keeps minimal lifecycle metadata in memory and updates activity", () => {
    const identifiers = ["session-one", "session-two"];
    const registry = new InMemorySessionRegistry({
      now: clock(
        "2026-07-21T01:00:00.000Z",
        "2026-07-21T01:01:00.000Z",
        "2026-07-21T01:02:00.000Z",
        "2026-07-21T01:03:00.000Z",
      ),
      generateId: () => identifiers.shift() ?? "session-fallback",
    });

    const first = registry.open("codex-desktop", "codex");
    expect(first).toEqual({
      sessionId: "session-one",
      client: "codex-desktop",
      agent: "codex",
      openedAt: "2026-07-21T01:00:00.000Z",
      lastActivityAt: "2026-07-21T01:00:00.000Z",
    });
    expect(Object.keys(first)).not.toContain("prompt");
    expect(Object.keys(first)).not.toContain("conversation");

    expect(registry.attachTask(first.sessionId, "AF-20260721-001")?.lastActivityAt).toBe(
      "2026-07-21T01:01:00.000Z",
    );
    expect(registry.close(first.sessionId)?.closedAt).toBe("2026-07-21T01:02:00.000Z");
    expect(registry.requireOpen(first.sessionId).status).toBe("closed");
    expect(registry.touch(first.sessionId)).toBeUndefined();

    const second = registry.open("antigravity-ide", "antigravity");
    expect(second.sessionId).toBe("session-two");
    expect(registry.requireOpen("missing").status).toBe("unknown");
  });

  it("retries colliding identifiers and fails closed after bounded attempts", () => {
    const identifiers = ["same", "same", "different"];
    const registry = new InMemorySessionRegistry({
      now: () => new Date("2026-07-21T01:00:00.000Z"),
      generateId: () => identifiers.shift() ?? "different",
    });
    expect(registry.open("one", "one").sessionId).toBe("same");
    expect(registry.open("two", "two").sessionId).toBe("different");
  });
});
