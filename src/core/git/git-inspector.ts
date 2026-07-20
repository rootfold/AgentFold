import type { ProcessRunner } from "../process/process-runner.js";

export interface GitWorkingFacts {
  readonly branch: string;
  readonly commit: string | null;
  readonly detached: boolean;
}

export interface GitInspector {
  readWorkingFacts(repositoryRoot: string): Promise<GitWorkingFacts>;
  isPathIgnored(repositoryRoot: string, repositoryRelativePath: string): Promise<boolean>;
}

export class GitInspectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitInspectionError";
  }
}

export class CommandGitInspector implements GitInspector {
  constructor(private readonly processRunner: ProcessRunner) {}

  async readWorkingFacts(repositoryRoot: string): Promise<GitWorkingFacts> {
    const [branchResult, commitResult] = await Promise.all([
      this.processRunner.run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
        cwd: repositoryRoot,
      }),
      this.processRunner.run("git", ["rev-parse", "--verify", "--quiet", "HEAD"], {
        cwd: repositoryRoot,
      }),
    ]);

    if (branchResult.exitCode !== 0 && branchResult.exitCode !== 1) {
      throw new GitInspectionError("Git could not determine the current branch.");
    }

    if (commitResult.exitCode !== 0 && commitResult.exitCode !== 1) {
      throw new GitInspectionError("Git could not determine the current HEAD commit.");
    }

    const detached = branchResult.exitCode === 1;
    const branch = detached ? "HEAD (detached)" : branchResult.stdout.trim();
    const commit = commitResult.exitCode === 0 ? commitResult.stdout.trim() : null;

    if (branch.length === 0 || (commit !== null && commit.length === 0)) {
      throw new GitInspectionError("Git returned incomplete branch or commit metadata.");
    }

    return { branch, commit, detached };
  }

  async isPathIgnored(repositoryRoot: string, repositoryRelativePath: string): Promise<boolean> {
    const result = await this.processRunner.run(
      "git",
      ["check-ignore", "--quiet", "--", repositoryRelativePath],
      { cwd: repositoryRoot },
    );

    if (result.exitCode === 0) {
      return true;
    }

    if (result.exitCode === 1) {
      return false;
    }

    throw new GitInspectionError("Git could not inspect ignore rules for active state.");
  }
}
