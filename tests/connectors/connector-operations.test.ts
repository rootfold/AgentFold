import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";
import { FilesystemGitRepositoryLocator } from "../../src/core/git/filesystem-git-repository-locator.js";
import type { ProcessRunner } from "../../src/core/process/process-runner.js";
import {
  applyAntigravityConnection,
  prepareAntigravityConnection,
  type AntigravityConnectorDependencies,
} from "../../src/integrations/connectors/antigravity/antigravity-connector.js";
import {
  applyAntigravityDisconnect,
  prepareAntigravityDisconnect,
} from "../../src/integrations/connectors/antigravity/antigravity-disconnect.js";
import { readAntigravityAgentFoldEntry } from "../../src/integrations/connectors/antigravity/antigravity-config.js";
import {
  antigravityContinuityRule,
  previousAntigravityContinuityRule,
} from "../../src/integrations/connectors/antigravity/antigravity-rule.js";
import { verifyAntigravityConnection } from "../../src/integrations/connectors/antigravity/antigravity-verification.js";
import { ConnectorOwnershipStore } from "../../src/integrations/connectors/ownership-store.js";
import { createContinuityFixture } from "../helpers/continuity-fixture.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const runner: ProcessRunner = {
  run: () => Promise.resolve({ exitCode: 0, stdout: "0.0.0", stderr: "" }),
};
const testDescriptor = {
  command: process.execPath,
  argsPrefix: [path.resolve("dist/cli.js")],
  fingerprint: "a".repeat(64),
} as const;

function connectorDependencies(
  root: string,
  home: string,
  stateDirectory: string,
  backupIdentity = "backup-unit-test",
): AntigravityConnectorDependencies {
  const fileSystem = new NodeFileSystem(() => root);
  return {
    fileSystem,
    gitRepositoryLocator: new FilesystemGitRepositoryLocator(fileSystem),
    processRunner: runner,
    version: "0.0.0-test",
    platform: {
      platform: process.platform,
      environment: { ...process.env, LOCALAPPDATA: home },
      homeDirectory: home,
    },
    stateDirectory,
    now: () => new Date("2026-07-21T12:00:00.000Z"),
    generateBackupIdentity: () => backupIdentity,
    resolveLaunchDescriptor: () => Promise.resolve(testDescriptor),
    verifyConnection: () =>
      Promise.resolve({
        host: "antigravity",
        valid: true,
        toolsAvailable: 9,
        serviceAvailable: true,
        exitCode: 0,
        diagnostics: [],
      }),
  };
}

async function fixtureWithHostConfig() {
  const repository = await createContinuityFixture(temporaryDirectories, {
    name: "agentfold connector repository with spaces ",
  });
  const home = await mkdtemp(path.join(os.tmpdir(), "agentfold fake Antigravity home "));
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "agentfold connector state "));
  temporaryDirectories.push(home, stateDirectory);
  const config = path.join(home, ".gemini", "config", "mcp_config.json");
  await mkdir(path.dirname(config), { recursive: true });
  const original = `{
  "mcpServers": {
    "unrelated": {
      "serverUrl": "https://example.test",
      "headers": { "Authorization": "FAKE_SECRET_CONNECTOR_TEST" }
    }
  },
  "theme": "dark"
}
`;
  await writeFile(config, original, "utf8");
  return { repository, home, stateDirectory, config, original };
}

describe("Antigravity connector operations", () => {
  it.each([
    ["missing config", "AFCN023"],
    ["missing entry", "AFCN024"],
    ["modified entry", "AFCN024"],
    ["stale executable", "AFCN025"],
    ["missing rule", "AFCN026"],
    ["modified rule", "AFCN027"],
  ] as const)("detects %s during read-only verification", async (scenario, diagnosticCode) => {
    const fixture = await fixtureWithHostConfig();
    const dependencies = connectorDependencies(
      fixture.repository.root,
      fixture.home,
      fixture.stateDirectory,
    );
    const plan = await prepareAntigravityConnection(dependencies, "ide");
    if (!plan.safe) throw new Error("Expected connector plan");
    await applyAntigravityConnection(plan, dependencies);
    const rulePath = path.join(
      fixture.repository.root,
      ".agents",
      "rules",
      "agentfold-continuity.md",
    );
    if (scenario === "missing config") await dependencies.fileSystem.remove(fixture.config);
    if (scenario === "missing entry") await writeFile(fixture.config, fixture.original, "utf8");
    if (scenario === "modified entry") {
      const parsed = JSON.parse(await readFile(fixture.config, "utf8")) as {
        mcpServers: { agentfold: { command: string } };
      };
      parsed.mcpServers.agentfold.command = "modified-command";
      await writeFile(fixture.config, JSON.stringify(parsed), "utf8");
    }
    if (scenario === "missing rule") await dependencies.fileSystem.remove(rulePath);
    if (scenario === "modified rule") await writeFile(rulePath, "# modified rule\n", "utf8");
    const ownershipPath = path.join(fixture.stateDirectory, "antigravity-ownership.json");
    const ownershipBefore = await dependencies.fileSystem.readBytes(ownershipPath);
    const result = await verifyAntigravityConnection({
      fileSystem: dependencies.fileSystem,
      gitRepositoryLocator: dependencies.gitRepositoryLocator,
      version: dependencies.version,
      platform: dependencies.platform!,
      stateDirectory: fixture.stateDirectory,
      startDirectory: fixture.repository.root,
      resolveDescriptor: () =>
        Promise.resolve(
          scenario === "stale executable"
            ? { ...testDescriptor, fingerprint: "b".repeat(64) }
            : testDescriptor,
        ),
      launchMcp: () => Promise.resolve({ toolsAvailable: 9 }),
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((item) => item.code === diagnosticCode)).toBe(true);
    expect(await dependencies.fileSystem.readBytes(ownershipPath)).toEqual(ownershipBefore);
  });

  it("previews without writes, then installs atomically with backup and ownership", async () => {
    const fixture = await fixtureWithHostConfig();
    const dependencies = connectorDependencies(
      fixture.repository.root,
      fixture.home,
      fixture.stateDirectory,
    );
    const preview = await prepareAntigravityConnection(dependencies, "ide");
    expect(preview.safe).toBe(true);
    if (!preview.safe) return;
    expect(preview.actions.map((item) => item.kind)).toEqual([
      "create_backup",
      "modify_config",
      "create_rule",
      "write_ownership",
    ]);
    expect(await readFile(fixture.config, "utf8")).toBe(fixture.original);
    await expect(
      dependencies.fileSystem.exists(
        path.join(fixture.repository.root, ".agents", "rules", "agentfold-continuity.md"),
      ),
    ).resolves.toBe(false);

    const installed = await applyAntigravityConnection(preview, dependencies);
    expect(installed.exitCode).toBe(0);
    const configBytes = await dependencies.fileSystem.readBytes(fixture.config);
    expect(readAntigravityAgentFoldEntry(configBytes)).toMatchObject({ command: process.execPath });
    expect(new TextDecoder().decode(configBytes)).toContain("FAKE_SECRET_CONNECTOR_TEST");
    await expect(
      readFile(path.join(fixture.stateDirectory, "backups", "backup-unit-test.backup"), "utf8"),
    ).resolves.toBe(fixture.original);
    if (process.platform !== "win32") {
      expect(
        (await stat(path.join(fixture.stateDirectory, "backups", "backup-unit-test.backup"))).mode &
          0o777,
      ).toBe(0o600);
    }
    await expect(
      readFile(
        path.join(fixture.repository.root, ".agents", "rules", "agentfold-continuity.md"),
        "utf8",
      ),
    ).resolves.toBe(antigravityContinuityRule);
    const ownership = await new ConnectorOwnershipStore(
      dependencies.fileSystem,
      fixture.stateDirectory,
    ).read();
    expect(ownership).toMatchObject({ connector: "antigravity", connectorVersion: 1 });
    expect(ownership?.surfaces).toHaveLength(1);
    expect(ownership?.workspaces).toHaveLength(1);
    expect(
      await readFile(path.join(fixture.stateDirectory, "antigravity-ownership.json"), "utf8"),
    ).not.toContain("FAKE_SECRET_CONNECTOR_TEST");

    const secondPlan = await prepareAntigravityConnection(dependencies, "ide");
    expect(secondPlan.safe).toBe(true);
    if (secondPlan.safe) {
      expect(secondPlan.configTargets[0]?.edit.action).toBe("identical");
      expect(secondPlan.rulePlan.action).toBe("identical");
      expect(secondPlan.actions).toHaveLength(0);
      expect(secondPlan.ownershipNeedsUpdate).toBe(false);
    }
  });

  it("upgrades an exact tracked legacy rule without machine-local ownership", async () => {
    const fixture = await fixtureWithHostConfig();
    const dependencies = connectorDependencies(
      fixture.repository.root,
      fixture.home,
      fixture.stateDirectory,
    );
    const rulePath = path.join(
      fixture.repository.root,
      ".agents",
      "rules",
      "agentfold-continuity.md",
    );
    await mkdir(path.dirname(rulePath), { recursive: true });
    await writeFile(rulePath, previousAntigravityContinuityRule.replace(/\n/gu, "\r\n"), "utf8");

    const plan = await prepareAntigravityConnection(dependencies, "ide");
    expect(plan.safe).toBe(true);
    if (!plan.safe) return;
    expect(plan.rulePlan.action).toBe("update");
    expect(plan.actions.some((item) => item.kind === "update_rule")).toBe(true);

    expect((await applyAntigravityConnection(plan, dependencies)).exitCode).toBe(0);
    await expect(readFile(rulePath, "utf8")).resolves.toBe(antigravityContinuityRule);
    const ownership = await new ConnectorOwnershipStore(
      dependencies.fileSystem,
      fixture.stateDirectory,
    ).read();
    expect(ownership?.workspaces).toHaveLength(1);
  });

  it("preserves exact multi-surface dependencies and backup ownership on reconnect", async () => {
    const fixture = await fixtureWithHostConfig();
    const dependencies = connectorDependencies(
      fixture.repository.root,
      fixture.home,
      fixture.stateDirectory,
    );
    const desktop = await prepareAntigravityConnection(dependencies, "desktop");
    if (!desktop.safe) throw new Error("Expected desktop connector plan");
    await applyAntigravityConnection(desktop, dependencies);

    const ide = await prepareAntigravityConnection(dependencies, "ide");
    if (!ide.safe) throw new Error("Expected IDE connector plan");
    await applyAntigravityConnection(ide, dependencies);
    const ownership = await new ConnectorOwnershipStore(
      dependencies.fileSystem,
      fixture.stateDirectory,
    ).read();
    expect(ownership?.surfaces.map((item) => item.surface).sort()).toEqual(["desktop", "ide"]);
    expect(ownership?.surfaces.every((item) => item.backupIdentity === "backup-unit-test")).toBe(
      true,
    );
    expect(ownership?.workspaces[0]?.connections.map((item) => item.surface).sort()).toEqual([
      "desktop",
      "ide",
    ]);

    const desktopDisconnect = await prepareAntigravityDisconnect(dependencies, "desktop");
    if (!desktopDisconnect.safe) throw new Error("Expected desktop disconnect plan");
    expect(desktopDisconnect.removeRule).toBe(false);
    expect(desktopDisconnect.configTargets).toHaveLength(0);
    await applyAntigravityDisconnect(desktopDisconnect, dependencies);
    expect(
      readAntigravityAgentFoldEntry(await dependencies.fileSystem.readBytes(fixture.config)),
    ).toBeDefined();

    const alreadyDisconnected = await prepareAntigravityDisconnect(dependencies, "desktop");
    expect(alreadyDisconnected).toMatchObject({ safe: true, actions: [] });
  });

  it("accepts a Git-normalized CRLF continuity rule across reconnect and verification", async () => {
    const fixture = await fixtureWithHostConfig();
    const dependencies = connectorDependencies(
      fixture.repository.root,
      fixture.home,
      fixture.stateDirectory,
    );
    const plan = await prepareAntigravityConnection(dependencies, "ide");
    if (!plan.safe) throw new Error("Expected connector plan");
    await applyAntigravityConnection(plan, dependencies);

    const rulePath = path.join(
      fixture.repository.root,
      ".agents",
      "rules",
      "agentfold-continuity.md",
    );
    await writeFile(rulePath, antigravityContinuityRule.replace(/\n/gu, "\r\n"), "utf8");

    const reconnect = await prepareAntigravityConnection(dependencies, "ide");
    expect(reconnect.safe).toBe(true);
    if (!reconnect.safe) return;
    expect(reconnect.rulePlan.action).toBe("identical");
    expect(reconnect.actions).toHaveLength(0);

    const verification = await verifyAntigravityConnection({
      fileSystem: dependencies.fileSystem,
      gitRepositoryLocator: dependencies.gitRepositoryLocator,
      version: dependencies.version,
      platform: dependencies.platform!,
      stateDirectory: fixture.stateDirectory,
      startDirectory: fixture.repository.root,
      resolveDescriptor: () => Promise.resolve(testDescriptor),
      launchMcp: () => Promise.resolve({ toolsAvailable: 9 }),
    });
    expect(verification.valid).toBe(false);
    expect(verification.diagnostics.some((item) => item.code === "AFCN027")).toBe(false);
    expect(verification.diagnostics.some((item) => item.code === "AFCN028")).toBe(true);
  });

  it("shares the global entry across repositories and disconnects only proven content", async () => {
    const fixture = await fixtureWithHostConfig();
    const firstDependencies = connectorDependencies(
      fixture.repository.root,
      fixture.home,
      fixture.stateDirectory,
      "backup-first-repository",
    );
    const firstPlan = await prepareAntigravityConnection(firstDependencies, "ide");
    if (!firstPlan.safe) throw new Error("Expected first connector plan");
    expect((await applyAntigravityConnection(firstPlan, firstDependencies)).exitCode).toBe(0);

    const second = await createContinuityFixture(temporaryDirectories, {
      name: "agentfold second connected repository ",
    });
    const secondDependencies = connectorDependencies(
      second.root,
      fixture.home,
      fixture.stateDirectory,
      "backup-second-repository",
    );
    const secondPlan = await prepareAntigravityConnection(secondDependencies, "ide");
    if (!secondPlan.safe) throw new Error("Expected second connector plan");
    expect(secondPlan.configTargets[0]?.edit.action).toBe("identical");
    expect((await applyAntigravityConnection(secondPlan, secondDependencies)).exitCode).toBe(0);
    const sharedOwnership = await new ConnectorOwnershipStore(
      secondDependencies.fileSystem,
      fixture.stateDirectory,
    ).read();
    expect(sharedOwnership?.workspaces).toHaveLength(2);

    const firstDisconnect = await prepareAntigravityDisconnect(firstDependencies);
    if (!firstDisconnect.safe) throw new Error("Expected first disconnect plan");
    expect(firstDisconnect.configTargets).toHaveLength(0);
    expect((await applyAntigravityDisconnect(firstDisconnect, firstDependencies)).exitCode).toBe(0);
    expect(
      readAntigravityAgentFoldEntry(await firstDependencies.fileSystem.readBytes(fixture.config)),
    ).toBeDefined();

    const secondDisconnect = await prepareAntigravityDisconnect(secondDependencies);
    if (!secondDisconnect.safe) throw new Error("Expected second disconnect plan");
    expect(secondDisconnect.configTargets).toHaveLength(1);
    expect((await applyAntigravityDisconnect(secondDisconnect, secondDependencies)).exitCode).toBe(
      0,
    );
    expect(
      readAntigravityAgentFoldEntry(await secondDependencies.fileSystem.readBytes(fixture.config)),
    ).toBeUndefined();
    expect(await readFile(fixture.config, "utf8")).toContain("FAKE_SECRET_CONNECTOR_TEST");
    expect(
      await secondDependencies.fileSystem.exists(
        path.join(second.root, ".agents", "rules", "agentfold-continuity.md"),
      ),
    ).toBe(false);
    expect(
      await secondDependencies.fileSystem.exists(
        path.join(fixture.stateDirectory, "antigravity-ownership.json"),
      ),
    ).toBe(false);
  });

  it("refuses user-owned entry and rule collisions without writes", async () => {
    const fixture = await fixtureWithHostConfig();
    const dependencies = connectorDependencies(
      fixture.repository.root,
      fixture.home,
      fixture.stateDirectory,
    );
    await writeFile(
      fixture.config,
      JSON.stringify({ mcpServers: { agentfold: { command: "user-tool" } } }),
      "utf8",
    );
    const entryCollision = await prepareAntigravityConnection(dependencies, "ide");
    expect(entryCollision).toMatchObject({ safe: false, exitCode: 5 });
    expect(await readFile(fixture.config, "utf8")).toContain("user-tool");

    await writeFile(fixture.config, fixture.original, "utf8");
    const rulePath = path.join(
      fixture.repository.root,
      ".agents",
      "rules",
      "agentfold-continuity.md",
    );
    await mkdir(path.dirname(rulePath), { recursive: true });
    await writeFile(rulePath, "# User rule\n", "utf8");
    const ruleCollision = await prepareAntigravityConnection(dependencies, "ide");
    expect(ruleCollision).toMatchObject({ safe: false, exitCode: 5 });
    expect(await readFile(rulePath, "utf8")).toBe("# User rule\n");
  });

  it("rolls back an earlier config mutation when a later atomic rule write fails", async () => {
    const fixture = await fixtureWithHostConfig();
    class RuleWriteFailureFileSystem extends NodeFileSystem {
      override writeTextAndFlush(filePath: string, content: string): Promise<void> {
        if (filePath.includes("agentfold-continuity.md")) {
          return Promise.reject(new Error("Simulated rule write failure"));
        }
        return super.writeTextAndFlush(filePath, content);
      }
    }
    const fileSystem = new RuleWriteFailureFileSystem(() => fixture.repository.root);
    const dependencies: AntigravityConnectorDependencies = {
      ...connectorDependencies(fixture.repository.root, fixture.home, fixture.stateDirectory),
      fileSystem,
      gitRepositoryLocator: new FilesystemGitRepositoryLocator(fileSystem),
    };
    const plan = await prepareAntigravityConnection(dependencies, "ide");
    if (!plan.safe) throw new Error("Expected connector plan");
    expect(await applyAntigravityConnection(plan, dependencies)).toMatchObject({
      status: "failed",
      exitCode: 1,
    });
    expect(await readFile(fixture.config, "utf8")).toBe(fixture.original);
    expect(
      await fileSystem.exists(path.join(fixture.stateDirectory, "antigravity-ownership.json")),
    ).toBe(false);
  });

  it("returns a severe diagnostic when installation rollback itself fails", async () => {
    const fixture = await fixtureWithHostConfig();
    class RollbackFailureFileSystem extends NodeFileSystem {
      private configRenameCount = 0;
      override writeTextAndFlush(filePath: string, content: string): Promise<void> {
        if (filePath.includes("agentfold-continuity.md")) {
          return Promise.reject(new Error("Simulated rule write failure"));
        }
        return super.writeTextAndFlush(filePath, content);
      }
      override rename(source: string, destination: string): Promise<void> {
        if (destination === fixture.config) {
          this.configRenameCount += 1;
          if (this.configRenameCount > 1) {
            return Promise.reject(new Error("Simulated rollback failure"));
          }
        }
        return super.rename(source, destination);
      }
    }
    const fileSystem = new RollbackFailureFileSystem(() => fixture.repository.root);
    const dependencies: AntigravityConnectorDependencies = {
      ...connectorDependencies(fixture.repository.root, fixture.home, fixture.stateDirectory),
      fileSystem,
      gitRepositoryLocator: new FilesystemGitRepositoryLocator(fileSystem),
    };
    const plan = await prepareAntigravityConnection(dependencies, "ide");
    if (!plan.safe) throw new Error("Expected connector plan");
    const result = await applyAntigravityConnection(plan, dependencies);
    expect(result.status).toBe("rollback_failed");
    expect(result.diagnostics.some((item) => item.code === "AFCN013")).toBe(true);
  });

  it("rejects symlink escapes and rechecks files immediately before apply", async () => {
    const fixture = await fixtureWithHostConfig();
    const dependencies = connectorDependencies(
      fixture.repository.root,
      fixture.home,
      fixture.stateDirectory,
    );
    const plan = await prepareAntigravityConnection(dependencies, "ide");
    if (!plan.safe) throw new Error("Expected connector plan");
    await writeFile(fixture.config, `${fixture.original} `, "utf8");
    expect(await applyAntigravityConnection(plan, dependencies)).toMatchObject({
      status: "failed",
    });
    expect(await readFile(fixture.config, "utf8")).toBe(`${fixture.original} `);

    const escapedHome = await mkdtemp(path.join(os.tmpdir(), "agentfold escaped config "));
    temporaryDirectories.push(escapedHome);
    const linkedHome = await mkdtemp(path.join(os.tmpdir(), "agentfold linked config home "));
    temporaryDirectories.push(linkedHome);
    await rm(path.join(linkedHome, ".gemini"), { recursive: true, force: true });
    await symlink(
      escapedHome,
      path.join(linkedHome, ".gemini"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const linkedDependencies = connectorDependencies(
      fixture.repository.root,
      linkedHome,
      fixture.stateDirectory,
    );
    expect(await prepareAntigravityConnection(linkedDependencies, "ide")).toMatchObject({
      safe: false,
      exitCode: 1,
    });

    const outsideRule = await mkdtemp(path.join(os.tmpdir(), "agentfold escaped rule "));
    temporaryDirectories.push(outsideRule);
    await symlink(
      outsideRule,
      path.join(fixture.repository.root, ".agents"),
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(await prepareAntigravityConnection(dependencies, "ide")).toMatchObject({
      safe: false,
      exitCode: 1,
    });
  });

  it("rejects a corrupt ownership registry before planning any writes", async () => {
    const fixture = await fixtureWithHostConfig();
    const dependencies = connectorDependencies(
      fixture.repository.root,
      fixture.home,
      fixture.stateDirectory,
    );
    await writeFile(
      path.join(fixture.stateDirectory, "antigravity-ownership.json"),
      '{"schemaVersion":1,"connector":"antigravity"}\n',
      "utf8",
    );
    const before = await readFile(fixture.config, "utf8");
    expect(await prepareAntigravityConnection(dependencies, "ide")).toMatchObject({
      safe: false,
      exitCode: 2,
    });
    expect(await readFile(fixture.config, "utf8")).toBe(before);
  });
});
