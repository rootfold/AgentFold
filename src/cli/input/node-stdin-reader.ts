import process from "node:process";

import type { StdinReader } from "./stdin-reader.js";

interface ReadableInput {
  [Symbol.asyncIterator](): AsyncIterator<Buffer | string>;
}

export class NodeStdinReader implements StdinReader {
  constructor(private readonly input: ReadableInput = process.stdin) {}

  async readAll(): Promise<string> {
    let content = "";
    for await (const chunk of this.input) {
      content += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    }
    return content;
  }
}
