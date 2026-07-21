import { createHash } from "node:crypto";

import { parse } from "smol-toml";

import type { CodexMcpEntry } from "./codex-launch-entry.js";

const startPrefix = "# agentfold:codex:start schema=";
const endMarker = "# agentfold:codex:end";

interface TextDocument {
  readonly source: string;
  readonly hasBom: boolean;
  readonly lineEnding: "\n" | "\r\n";
  readonly hadFinalNewline: boolean;
}

interface LineSpan {
  readonly text: string;
  readonly start: number;
  readonly textEnd: number;
  readonly end: number;
}

interface ManagedRegion {
  readonly schemaVersion: number;
  readonly start: number;
  readonly textEnd: number;
  readonly end: number;
  readonly text: string;
}

export type CodexTomlEditAction = "create" | "append" | "update" | "identical";

export type CodexTomlEditResult =
  | {
      readonly status: "ready";
      readonly action: CodexTomlEditAction;
      readonly bytes: Uint8Array;
      readonly regionFingerprint: string;
    }
  | { readonly status: "collision"; readonly reason: string };

export type CodexTomlRemovalResult =
  | { readonly status: "ready"; readonly changed: boolean; readonly bytes: Uint8Array }
  | { readonly status: "collision"; readonly reason: string };

export class CodexConfigSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexConfigSyntaxError";
  }
}

function decode(bytes: Uint8Array | undefined): TextDocument {
  if (bytes === undefined) {
    return { source: "", hasBom: false, lineEnding: "\n", hadFinalNewline: true };
  }
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(hasBom ? bytes.slice(3) : bytes);
  } catch {
    throw new CodexConfigSyntaxError("The Codex configuration is not valid UTF-8.");
  }
  return {
    source,
    hasBom,
    lineEnding: source.includes("\r\n") ? "\r\n" : "\n",
    hadFinalNewline: source.endsWith("\n"),
  };
}

function encode(document: TextDocument, source: string): Uint8Array {
  const content = new TextEncoder().encode(source);
  if (!document.hasBom) return content;
  const bytes = new Uint8Array(content.length + 3);
  bytes.set([0xef, 0xbb, 0xbf]);
  bytes.set(content, 3);
  return bytes;
}

function lines(source: string): readonly LineSpan[] {
  const result: LineSpan[] = [];
  let start = 0;
  while (start < source.length) {
    const newline = source.indexOf("\n", start);
    const end = newline === -1 ? source.length : newline + 1;
    const textEnd =
      newline === -1
        ? source.length
        : newline > start && source[newline - 1] === "\r"
          ? newline - 1
          : newline;
    result.push({ text: source.slice(start, textEnd), start, textEnd, end });
    start = end;
  }
  return result;
}

function locateRegion(source: string): ManagedRegion | undefined | "malformed" {
  const sourceLines = lines(source);
  const starts = sourceLines.filter((line) => line.text.startsWith(startPrefix));
  const ends = sourceLines.filter((line) => line.text === endMarker);
  if (starts.length === 0 && ends.length === 0) {
    return source.includes("agentfold:codex:start") || source.includes("agentfold:codex:end")
      ? "malformed"
      : undefined;
  }
  if (starts.length !== 1 || ends.length !== 1) return "malformed";
  const versionText = starts[0]!.text.slice(startPrefix.length);
  if (!/^\d+$/u.test(versionText) || starts[0]!.start >= ends[0]!.start) return "malformed";
  return {
    schemaVersion: Number(versionText),
    start: starts[0]!.start,
    textEnd: ends[0]!.textEnd,
    end: ends[0]!.end,
    text: source.slice(starts[0]!.start, ends[0]!.textEnd),
  };
}

function parseDocument(source: string): Record<string, unknown> {
  try {
    return parse(source) as Record<string, unknown>;
  } catch {
    throw new CodexConfigSyntaxError(
      "The Codex configuration contains malformed or unsupported TOML.",
    );
  }
}

function agentFoldEntry(parsed: Record<string, unknown>): unknown | undefined {
  const servers = parsed.mcp_servers;
  if (typeof servers !== "object" || servers === null || Array.isArray(servers)) return undefined;
  return Object.prototype.hasOwnProperty.call(servers, "agentfold")
    ? (servers as Record<string, unknown>).agentfold
    : undefined;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function renderCodexMcpRegion(
  entry: CodexMcpEntry,
  lineEnding: "\n" | "\r\n" = "\n",
  schemaVersion = 1,
): string {
  return [
    `${startPrefix}${schemaVersion}`,
    "[mcp_servers.agentfold]",
    `command = ${tomlString(entry.command)}`,
    `args = [${entry.args.map(tomlString).join(", ")}]`,
    "required = true",
    endMarker,
  ].join(lineEnding);
}

export function renderLegacyCodexMcpRegion(
  entry: CodexMcpEntry,
  lineEnding: "\n" | "\r\n" = "\n",
): string {
  return [
    `${startPrefix}0`,
    "[mcp_servers.agentfold]",
    `command = ${tomlString(entry.command)}`,
    `args = [${entry.args.map(tomlString).join(", ")}]`,
    endMarker,
  ].join(lineEnding);
}

export function fingerprintCodexRegion(region: string): string {
  return createHash("sha256").update(region, "utf8").digest("hex");
}

function appendRegion(document: TextDocument, region: string): string {
  if (document.source.length === 0) return `${region}${document.lineEnding}`;
  const separator = document.hadFinalNewline
    ? document.lineEnding
    : `${document.lineEnding}${document.lineEnding}`;
  return `${document.source}${separator}${region}${document.hadFinalNewline ? document.lineEnding : ""}`;
}

export function prepareCodexTomlEdit(
  original: Uint8Array | undefined,
  entry: CodexMcpEntry,
  provenFingerprints: readonly string[] = [],
): CodexTomlEditResult {
  const document = decode(original);
  const region = locateRegion(document.source);
  if (region === "malformed") {
    return {
      status: "collision",
      reason: "The Codex configuration has malformed or duplicate AgentFold markers.",
    };
  }
  const parsed = parseDocument(document.source);
  const expected = renderCodexMcpRegion(entry, document.lineEnding);
  const expectedFingerprint = fingerprintCodexRegion(expected);
  const legacyFingerprint = fingerprintCodexRegion(
    renderLegacyCodexMcpRegion(entry, document.lineEnding),
  );
  if (region === undefined) {
    if (agentFoldEntry(parsed) !== undefined) {
      return {
        status: "collision",
        reason: "A user-owned Codex `agentfold` MCP entry already exists.",
      };
    }
    const source = appendRegion(document, expected);
    parseDocument(source);
    return {
      status: "ready",
      action: original === undefined ? "create" : "append",
      bytes: encode(document, source),
      regionFingerprint: expectedFingerprint,
    };
  }
  const currentFingerprint = fingerprintCodexRegion(region.text);
  if (currentFingerprint === expectedFingerprint) {
    return {
      status: "ready",
      action: "identical",
      bytes: encode(document, document.source),
      regionFingerprint: currentFingerprint,
    };
  }
  if (
    !provenFingerprints.includes(currentFingerprint) &&
    currentFingerprint !== legacyFingerprint
  ) {
    return { status: "collision", reason: "The AgentFold-owned Codex MCP region was modified." };
  }
  const source = `${document.source.slice(0, region.start)}${expected}${document.source.slice(region.textEnd)}`;
  parseDocument(source);
  return {
    status: "ready",
    action: "update",
    bytes: encode(document, source),
    regionFingerprint: expectedFingerprint,
  };
}

export function prepareCodexTomlRemoval(
  original: Uint8Array,
  expectedFingerprint: string,
): CodexTomlRemovalResult {
  const document = decode(original);
  const region = locateRegion(document.source);
  if (region === "malformed") {
    return {
      status: "collision",
      reason: "The Codex configuration has malformed or duplicate AgentFold markers.",
    };
  }
  const parsed = parseDocument(document.source);
  if (region === undefined) {
    return agentFoldEntry(parsed) === undefined
      ? { status: "ready", changed: false, bytes: original }
      : { status: "collision", reason: "A user-owned Codex `agentfold` MCP entry is present." };
  }
  if (fingerprintCodexRegion(region.text) !== expectedFingerprint) {
    return { status: "collision", reason: "The AgentFold-owned Codex MCP region was modified." };
  }
  let prefix = document.source.slice(0, region.start);
  const suffix = document.source.slice(region.end);
  if (prefix.endsWith(`${document.lineEnding}${document.lineEnding}`)) {
    prefix = prefix.slice(0, -document.lineEnding.length);
  }
  if (!document.hadFinalNewline && suffix.length === 0 && prefix.endsWith(document.lineEnding)) {
    prefix = prefix.slice(0, -document.lineEnding.length);
  }
  const source = `${prefix}${suffix}`;
  parseDocument(source);
  return { status: "ready", changed: true, bytes: encode(document, source) };
}

export function readCodexAgentFoldEntry(bytes: Uint8Array): unknown | undefined {
  return agentFoldEntry(parseDocument(decode(bytes).source));
}

export function readCodexManagedRegion(bytes: Uint8Array): string | undefined {
  const document = decode(bytes);
  parseDocument(document.source);
  const region = locateRegion(document.source);
  if (region === "malformed")
    throw new CodexConfigSyntaxError(
      "The Codex configuration has malformed or duplicate AgentFold markers.",
    );
  return region?.text;
}
