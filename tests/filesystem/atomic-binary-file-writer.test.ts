import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AtomicBinaryFileWriter } from "../../src/core/filesystem/atomic-binary-file-writer.js";
import { AtomicFileConflictError } from "../../src/core/filesystem/atomic-text-file-writer.js";
import { NodeFileSystem } from "../../src/core/filesystem/node-filesystem.js";

const temporaryDirectories: string[] = [];
const encoder = new TextEncoder();

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<{ readonly root: string; readonly fileSystem: NodeFileSystem }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "agentfold-atomic-binary-"));
  temporaryDirectories.push(root);
  return { root, fileSystem: new NodeFileSystem(() => root) };
}

describe("AtomicBinaryFileWriter", () => {
  it("creates exact bytes, prepares permissions before publication, and refuses overwrite", async () => {
    const testFixture = await fixture();
    const destination = path.join(testFixture.root, "config", "mcp_config.json");
    const prepare = vi.fn(async (temporaryPath: string) => {
      await expect(testFixture.fileSystem.exists(temporaryPath)).resolves.toBe(true);
      await expect(testFixture.fileSystem.exists(destination)).resolves.toBe(false);
    });
    const writer = new AtomicBinaryFileWriter(testFixture.fileSystem, () => ".config.tmp", prepare);
    const original = new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode("{}\r\n")]);
    await writer.write(destination, original, "create");
    expect(Array.from(await testFixture.fileSystem.readBytes(destination))).toEqual(
      Array.from(original),
    );
    expect(prepare).toHaveBeenCalledTimes(1);
    await expect(
      new AtomicBinaryFileWriter(testFixture.fileSystem, () => ".collision.tmp").write(
        destination,
        encoder.encode("changed"),
        "create",
      ),
    ).rejects.toBeInstanceOf(AtomicFileConflictError);
    expect(Array.from(await testFixture.fileSystem.readBytes(destination))).toEqual(
      Array.from(original),
    );
  });

  it("cleans temporary bytes and preserves the original after write or rename failures", async () => {
    const testFixture = await fixture();
    class FailingWriteFileSystem extends NodeFileSystem {
      override writeBytesAndFlush(): Promise<void> {
        return Promise.reject(new Error("Simulated binary write failure"));
      }
    }
    const destination = path.join(testFixture.root, "mcp_config.json");
    await expect(
      new AtomicBinaryFileWriter(
        new FailingWriteFileSystem(() => testFixture.root),
        () => ".binary.tmp",
      ).write(destination, encoder.encode("new"), "create"),
    ).rejects.toThrow("Simulated binary write failure");
    await expect(testFixture.fileSystem.exists(destination)).resolves.toBe(false);
    await expect(
      testFixture.fileSystem.exists(path.join(testFixture.root, ".binary.tmp")),
    ).resolves.toBe(false);

    class FailingRenameFileSystem extends NodeFileSystem {
      override rename(): Promise<void> {
        return Promise.reject(new Error("Simulated binary rename failure"));
      }
    }
    const original = encoder.encode("original");
    await testFixture.fileSystem.writeBytesAndFlush(destination, original);
    await expect(
      new AtomicBinaryFileWriter(
        new FailingRenameFileSystem(() => testFixture.root),
        () => ".binary.tmp",
      ).write(destination, encoder.encode("replacement"), "replace"),
    ).rejects.toThrow("Simulated binary rename failure");
    expect(Array.from(await testFixture.fileSystem.readBytes(destination))).toEqual(
      Array.from(original),
    );
    await expect(
      testFixture.fileSystem.exists(path.join(testFixture.root, ".binary.tmp")),
    ).resolves.toBe(false);
  });
});
