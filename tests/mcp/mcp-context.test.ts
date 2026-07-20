import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";
import { FilesystemGitRepositoryLocator } from "../../src/core/git/filesystem-git-repository-locator.js";
import { createMcpApplicationContext } from "../../src/integrations/mcp/mcp-context.js";
import { createMcpToolHandlers } from "../../src/integrations/mcp/mcp-tools.js";
import { InMemorySessionRegistry } from "../../src/integrations/mcp/session-registry.js";
import { createContinuityFixture, StubGitInspector } from "../helpers/continuity-fixture.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function contextInput(fileSystem: NodeFileSystem, locator: FilesystemGitRepositoryLocator) {
  return {
    version: "0.0.0-test",
    fileSystem,
    gitRepositoryLocator: locator,
    gitInspector: new StubGitInspector(undefined, true),
    sessions: new InMemorySessionRegistry({ generateId: () => "session" }),
    logger: { debug: () => undefined, error: () => undefined },
  };
}

describe("MCP fixed workspace", () => {
  it("defaults to a nested current directory and resolves the containing Git root", async () => {
    const fixture = await createContinuityFixture(temporaryDirectories, {
      name: "agentfold mcp context spaces ",
      nestedWorkingDirectory: "packages/app",
    });
    const result = await createMcpApplicationContext(
      contextInput(fixture.fileSystem, fixture.gitRepositoryLocator),
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.context.requestedWorkspace).toBe(fixture.workingDirectory);
      expect(result.context.repositoryRoot).toBe(await fixture.fileSystem.realPath(fixture.root));
    }
  });

  it("accepts an explicit workspace but rejects a non-repository safely", async () => {
    const fixture = await createContinuityFixture(temporaryDirectories, {
      nestedWorkingDirectory: "packages/app",
    });
    const explicit = await createMcpApplicationContext({
      ...contextInput(fixture.fileSystem, fixture.gitRepositoryLocator),
      workspace: fixture.workingDirectory,
    });
    expect(explicit.status).toBe("success");

    const outside = await mkdtemp(path.join(os.tmpdir(), "agentfold-mcp-no-git-"));
    temporaryDirectories.push(outside);
    const outsideFileSystem = new NodeFileSystem(() => outside);
    const invalid = await createMcpApplicationContext({
      ...contextInput(outsideFileSystem, new FilesystemGitRepositoryLocator(outsideFileSystem)),
      workspace: outside,
    });
    expect(invalid).toMatchObject({ status: "error" });
    expect(JSON.stringify(invalid)).not.toContain(outside);
  });

  it("keeps uninitialized repository status readable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentfold-mcp-uninitialized-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, ".git"));
    const fileSystem = new NodeFileSystem(() => root);
    const locator = new FilesystemGitRepositoryLocator(fileSystem);
    const result = await createMcpApplicationContext(contextInput(fileSystem, locator));
    if (result.status !== "success") throw new Error("Expected uninitialized Git context");
    const status = await createMcpToolHandlers(result.context).getStatus({});
    expect(status.ok).toBe(true);
    expect(status.status).toBe("uninitialized");
    expect(JSON.stringify(status)).not.toContain(root);
  });

  it("does not treat a symlink outside the repository as part of the fixed workspace", async () => {
    const fixture = await createContinuityFixture(temporaryDirectories);
    const outside = await mkdtemp(path.join(os.tmpdir(), "agentfold-mcp-link-target-"));
    temporaryDirectories.push(outside);
    const link = path.join(fixture.root, "external-workspace");
    try {
      await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "EPERM") return;
      throw error;
    }
    const result = await createMcpApplicationContext({
      ...contextInput(fixture.fileSystem, fixture.gitRepositoryLocator),
      workspace: link,
    });
    expect(result.status).toBe("error");
  });
});
