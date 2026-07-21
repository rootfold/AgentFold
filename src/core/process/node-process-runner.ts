import { execFile } from "node:child_process";

import type { ProcessResult, ProcessRunner, ProcessRunOptions } from "./process-runner.js";

export class NodeProcessRunner implements ProcessRunner {
  run(
    command: string,
    arguments_: readonly string[],
    options: ProcessRunOptions,
  ): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      execFile(
        command,
        [...arguments_],
        {
          cwd: options.cwd,
          ...(options.environment === undefined
            ? {}
            : {
                env: Object.fromEntries(
                  Object.entries(options.environment).filter(
                    (entry): entry is [string, string] => entry[1] !== undefined,
                  ),
                ),
              }),
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error === null) {
            resolve({ exitCode: 0, stdout, stderr });
            return;
          }

          if (typeof error.code !== "number") {
            reject(error);
            return;
          }

          resolve({ exitCode: error.code, stdout, stderr });
        },
      );
    });
  }
}
