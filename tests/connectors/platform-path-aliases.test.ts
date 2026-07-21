import path from "node:path";

import { describe, expect, it } from "vitest";

import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";
import {
  normalizeKnownPlatformPathAliases,
  samePlatformPath,
} from "../../src/core/filesystem/platform-path-aliases.js";
import { validateConnectorHostPath } from "../../src/integrations/connectors/connector-path-safety.js";

class DarwinAliasFileSystem extends NodeFileSystem {
  override exists(): Promise<boolean> {
    return Promise.resolve(true);
  }

  override isSymbolicLink(candidate: string): Promise<boolean> {
    return Promise.resolve(candidate === "/var" || candidate === "/var/folders/escaped");
  }

  override realPath(candidate: string): Promise<string> {
    if (candidate === "/var") return Promise.resolve("/private/var");
    if (candidate === "/var/folders/escaped") return Promise.resolve("/outside");
    return Promise.resolve(candidate.replace(/^\/var(?=\/|$)/u, "/private/var"));
  }
}

describe("platform path aliases", () => {
  it("canonicalizes only fixed macOS system aliases", () => {
    expect(normalizeKnownPlatformPathAliases("/var/folders/project", "darwin")).toBe(
      "/private/var/folders/project",
    );
    expect(samePlatformPath("/tmp/agentfold", "/private/tmp/agentfold", "darwin")).toBe(true);
    expect(samePlatformPath("/var/folders/project", "/outside/project", "darwin")).toBe(false);
    expect(normalizeKnownPlatformPathAliases("/var/folders/project", "linux")).toBe(
      "/var/folders/project",
    );
    expect(normalizeKnownPlatformPathAliases("C:\\Users\\Dev", "win32")).toBe(
      path.win32.resolve("C:\\Users\\Dev").toLocaleLowerCase("en-US"),
    );
  });

  it("allows the macOS /var alias but rejects a nested symlink", async () => {
    const fileSystem = new DarwinAliasFileSystem();
    await expect(
      validateConnectorHostPath(fileSystem, "/var/folders/project/config.json", "darwin"),
    ).resolves.toBeUndefined();
    await expect(
      validateConnectorHostPath(fileSystem, "/var/folders/escaped/project/config.json", "darwin"),
    ).rejects.toThrow(/symbolic link/u);
  });
});
