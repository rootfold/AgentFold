import { describe, expect, it } from "vitest";

import { ConfigValidationError, parseConfig } from "../../src/core/config/parse-config.js";

function validConfiguration(): unknown {
  return {
    version: 1,
    project: {
      name: "AgentFold",
      summary: "Portable context for coding agents.",
    },
    runtime: {
      node: ">=20",
    },
    package_manager: "pnpm",
    commands: {
      test: "pnpm test",
    },
    state: {
      visibility: "local",
    },
    safety: {
      respect_gitignore: true,
      excluded_paths: [".env", "**/*.pem"],
    },
    adapters: {
      codex: {
        enabled: true,
      },
    },
  };
}

describe("parseConfig", () => {
  it("parses a valid configuration object", () => {
    const configuration = parseConfig(validConfiguration());

    expect(configuration.project.name).toBe("AgentFold");
    expect(configuration.state.visibility).toBe("local");
  });

  it("rejects unsupported schema versions", () => {
    const input = { ...(validConfiguration() as Record<string, unknown>), version: 2 };

    expect(() => parseConfig(input)).toThrowError(ConfigValidationError);
    expect(() => parseConfig(input)).toThrowError(/version/u);
  });

  it("rejects invalid state visibility", () => {
    const input = validConfiguration() as Record<string, unknown>;
    input.state = { visibility: "shared" };

    expect(() => parseConfig(input)).toThrowError(/state\.visibility/u);
  });

  it("rejects missing required project fields", () => {
    const input = validConfiguration() as Record<string, unknown>;
    input.project = { name: "AgentFold" };

    expect(() => parseConfig(input)).toThrowError(/project\.summary/u);
  });
});
