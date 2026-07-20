import path from "node:path";

import { normalizeRepositoryPath } from "../config/repository-path.js";
import { isPathInside, resolvePortableRepositoryPath } from "../context/path-boundary.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import {
  AtomicFileConflictError,
  type AtomicTextFileWriter,
} from "../filesystem/atomic-text-file-writer.js";
import type { FileSystem } from "../filesystem/filesystem.js";
import type { ResumeFormat } from "./types.js";

export type ResumeOutputPathResult =
  | {
      readonly status: "ready";
      readonly destination: string;
      readonly relativePath: string;
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly status: "error";
      readonly exitCode: 1 | 2 | 5;
      readonly diagnostics: readonly Diagnostic[];
    };

function failure(
  exitCode: 1 | 2 | 5,
  code: string,
  message: string,
  suggestion: string,
): ResumeOutputPathResult {
  return {
    status: "error",
    exitCode,
    diagnostics: [{ code, severity: "error", message, suggestion }],
  };
}

async function nearestExistingAncestor(fileSystem: FileSystem, candidate: string): Promise<string> {
  let current = path.dirname(candidate);
  for (;;) {
    if ((await fileSystem.entryType(current)) !== undefined) return current;
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

export async function prepareResumeOutputPath(
  fileSystem: FileSystem,
  repositoryRoot: string,
  requestedPath: string,
  format: ResumeFormat,
): Promise<ResumeOutputPathResult> {
  const normalized = normalizeRepositoryPath(requestedPath);
  if (!normalized.success) {
    return failure(
      2,
      "AFR020",
      "The resume output path is unsafe.",
      "Use a repository-relative path without parent traversal or an absolute prefix.",
    );
  }

  const destination = resolvePortableRepositoryPath(repositoryRoot, normalized.path);
  if (!isPathInside(repositoryRoot, destination)) {
    return failure(
      2,
      "AFR020",
      "The resume output path escapes the repository.",
      "Choose a destination inside the active Git repository.",
    );
  }

  try {
    const realRoot = await fileSystem.realPath(repositoryRoot);
    const destinationType = await fileSystem.entryType(destination);
    if (destinationType !== undefined) {
      const realDestination = await fileSystem.realPath(destination);
      if (!isPathInside(realRoot, realDestination)) {
        return failure(
          2,
          "AFR020",
          "The resume output path resolves outside the repository.",
          "Replace the escaping symbolic link or choose another destination.",
        );
      }
      return failure(
        5,
        "AFR021",
        `Resume output already exists: ${normalized.path}`,
        "Choose a new output path; resume never overwrites existing files.",
      );
    }

    const ancestor = await nearestExistingAncestor(fileSystem, destination);
    if ((await fileSystem.entryType(ancestor)) !== "directory") {
      return failure(
        5,
        "AFR021",
        "A parent of the resume output path is not a directory.",
        "Choose an output path beneath an existing directory.",
      );
    }
    const realAncestor = await fileSystem.realPath(ancestor);
    if (!isPathInside(realRoot, realAncestor)) {
      return failure(
        2,
        "AFR020",
        "A parent of the resume output path resolves outside the repository.",
        "Replace the escaping symbolic link or choose another destination.",
      );
    }

    const diagnostics: Diagnostic[] = [];
    const expectedExtension = format === "json" ? ".json" : ".md";
    if (path.extname(normalized.path).toLowerCase() !== expectedExtension) {
      diagnostics.push({
        code: "AFR019",
        severity: "warning",
        message: `The output extension does not match ${format} format.`,
        suggestion: `Use ${expectedExtension} for clearer tooling behavior.`,
      });
    }
    return {
      status: "ready",
      destination,
      relativePath: normalized.path,
      diagnostics,
    };
  } catch {
    return failure(
      1,
      "AFR018",
      "The resume output path could not be checked safely.",
      "Check repository permissions and the destination path, then retry.",
    );
  }
}

export type CommitResumeOutputResult =
  | { readonly status: "success"; readonly diagnostics: readonly Diagnostic[] }
  | {
      readonly status: "error";
      readonly exitCode: 1 | 5;
      readonly diagnostics: readonly Diagnostic[];
    };

export async function commitResumeOutput(
  writer: AtomicTextFileWriter,
  destination: string,
  relativePath: string,
  content: string,
): Promise<CommitResumeOutputResult> {
  try {
    await writer.write(destination, content, "create");
    return {
      status: "success",
      diagnostics: [
        {
          code: "AFR022",
          severity: "success",
          message: `Resume packet written atomically: ${relativePath}`,
        },
      ],
    };
  } catch (error: unknown) {
    if (error instanceof AtomicFileConflictError) {
      return {
        status: "error",
        exitCode: 5,
        diagnostics: [
          {
            code: "AFR021",
            severity: "error",
            message: "The resume output destination appeared before it could be created.",
            suggestion: "Choose a new output path; no existing file was overwritten.",
          },
        ],
      };
    }
    return {
      status: "error",
      exitCode: 1,
      diagnostics: [
        {
          code: "AFR018",
          severity: "error",
          message: "The resume packet could not be written atomically.",
          suggestion: "Check repository permissions and retry with a new output path.",
        },
      ],
    };
  }
}
