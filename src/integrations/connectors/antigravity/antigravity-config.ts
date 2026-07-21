import { createHash } from "node:crypto";

import { z } from "zod";

import type { AntigravityMcpEntry } from "./antigravity-launch-entry.js";

interface JsonMemberSpan {
  readonly key: string;
  readonly propertyStart: number;
  readonly valueStart: number;
  readonly valueEnd: number;
  readonly commaIndex?: number;
}

interface JsonObjectSpan {
  readonly start: number;
  readonly end: number;
  readonly members: readonly JsonMemberSpan[];
}

interface ParsedAntigravityConfig {
  readonly source: string;
  readonly bom: boolean;
  readonly eol: "\n" | "\r\n";
  readonly indent: string;
  readonly finalNewline: boolean;
  readonly root: Record<string, unknown>;
  readonly rootSpan: JsonObjectSpan;
}

export type AntigravityConfigEditAction = "create" | "insert" | "update" | "identical";

export type AntigravityConfigEditResult =
  | {
      readonly status: "ready";
      readonly action: AntigravityConfigEditAction;
      readonly bytes: Uint8Array;
      readonly entryFingerprint: string;
    }
  | {
      readonly status: "collision";
      readonly existingEntryFingerprint: string;
      readonly entryFingerprint: string;
    };

export type AntigravityConfigRemovalResult =
  | { readonly status: "ready"; readonly changed: boolean; readonly bytes: Uint8Array }
  | { readonly status: "collision"; readonly existingEntryFingerprint: string };

export class AntigravityConfigSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AntigravityConfigSyntaxError";
  }
}

const objectBoundarySchema = z.record(z.string(), z.unknown());

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function fingerprintJsonValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function skipWhitespace(source: string, index: number): number {
  let current = index;
  while (/\s/u.test(source[current] ?? "")) current += 1;
  return current;
}

function scanString(source: string, index: number): number {
  if (source[index] !== '"') throw new AntigravityConfigSyntaxError("Expected a JSON string.");
  let current = index + 1;
  while (current < source.length) {
    if (source[current] === "\\") {
      current += 2;
      continue;
    }
    if (source[current] === '"') return current + 1;
    current += 1;
  }
  throw new AntigravityConfigSyntaxError("An Antigravity JSON string is unterminated.");
}

function scanArray(source: string, index: number): number {
  let current = skipWhitespace(source, index + 1);
  if (source[current] === "]") return current + 1;
  while (current < source.length) {
    current = skipWhitespace(source, scanValue(source, current));
    if (source[current] === "]") return current + 1;
    if (source[current] !== ",") {
      throw new AntigravityConfigSyntaxError("An Antigravity JSON array is malformed.");
    }
    current = skipWhitespace(source, current + 1);
  }
  throw new AntigravityConfigSyntaxError("An Antigravity JSON array is unterminated.");
}

function scanPrimitive(source: string, index: number): number {
  let current = index;
  while (current < source.length && !/[\s,}\]]/u.test(source[current] ?? "")) current += 1;
  if (current === index) throw new AntigravityConfigSyntaxError("A JSON value is missing.");
  return current;
}

function scanValue(source: string, index: number): number {
  const first = source[index];
  if (first === '"') return scanString(source, index);
  if (first === "{") return scanObject(source, index).end + 1;
  if (first === "[") return scanArray(source, index);
  return scanPrimitive(source, index);
}

function scanObject(source: string, index: number): JsonObjectSpan {
  if (source[index] !== "{") throw new AntigravityConfigSyntaxError("Expected a JSON object.");
  const members: JsonMemberSpan[] = [];
  const keys = new Set<string>();
  let current = skipWhitespace(source, index + 1);
  if (source[current] === "}") return { start: index, end: current, members };
  while (current < source.length) {
    const propertyStart = current;
    const keyEnd = scanString(source, current);
    let key: string;
    try {
      key = JSON.parse(source.slice(current, keyEnd)) as string;
    } catch {
      throw new AntigravityConfigSyntaxError("An Antigravity configuration key is invalid.");
    }
    if (keys.has(key)) {
      throw new AntigravityConfigSyntaxError(
        "Duplicate JSON keys are not supported safely in Antigravity configuration.",
      );
    }
    keys.add(key);
    current = skipWhitespace(source, keyEnd);
    if (source[current] !== ":") {
      throw new AntigravityConfigSyntaxError("An Antigravity configuration property is malformed.");
    }
    const valueStart = skipWhitespace(source, current + 1);
    const valueEnd = scanValue(source, valueStart);
    current = skipWhitespace(source, valueEnd);
    if (source[current] === ",") {
      members.push({ key, propertyStart, valueStart, valueEnd, commaIndex: current });
      current = skipWhitespace(source, current + 1);
      continue;
    }
    members.push({ key, propertyStart, valueStart, valueEnd });
    if (source[current] === "}") return { start: index, end: current, members };
    throw new AntigravityConfigSyntaxError("An Antigravity JSON object is malformed.");
  }
  throw new AntigravityConfigSyntaxError("An Antigravity JSON object is unterminated.");
}

function containsComments(source: string): boolean {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length - 1; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "/" && ["/", "*"].includes(source[index + 1] ?? "")) return true;
  }
  return false;
}

function decodeConfig(bytes: Uint8Array | undefined): ParsedAntigravityConfig {
  const creating = bytes === undefined;
  const value = bytes ?? new TextEncoder().encode("{}");
  const bom = value[0] === 0xef && value[1] === 0xbb && value[2] === 0xbf;
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bom ? value.slice(3) : value);
  } catch {
    throw new AntigravityConfigSyntaxError("Antigravity configuration is not valid UTF-8.");
  }
  const finalNewline = creating || /(?:\r\n|\n)$/u.test(decoded);
  const eol = decoded.includes("\r\n") ? "\r\n" : "\n";
  const indentation = /(?:\r\n|\n)([ \t]+)"/u.exec(decoded)?.[1] ?? "  ";
  const source = decoded.trim().length === 0 ? "{}" : decoded;
  if (containsComments(source)) {
    throw new AntigravityConfigSyntaxError(
      "JSON comments are not supported safely in Antigravity configuration.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new AntigravityConfigSyntaxError("Antigravity MCP configuration contains invalid JSON.");
  }
  const root = objectBoundarySchema.safeParse(parsed);
  if (!root.success || Array.isArray(parsed)) {
    throw new AntigravityConfigSyntaxError("Antigravity MCP configuration must be a JSON object.");
  }
  const rootStart = skipWhitespace(source, 0);
  const rootSpan = scanObject(source, rootStart);
  return { source, bom, eol, indent: indentation, finalNewline, root: root.data, rootSpan };
}

function lineIndent(source: string, index: number): string {
  const lineStart = Math.max(source.lastIndexOf("\n", index - 1) + 1, 0);
  return /^[ \t]*/u.exec(source.slice(lineStart, index))?.[0] ?? "";
}

function renderProperty(
  key: string,
  value: unknown,
  propertyIndent: string,
  indent: string,
  eol: string,
): string {
  const rendered = JSON.stringify(value, undefined, indent).replaceAll("\n", eol + propertyIndent);
  return `${JSON.stringify(key)}: ${rendered}`;
}

function insertMember(
  source: string,
  object: JsonObjectSpan,
  key: string,
  value: unknown,
  indent: string,
  eol: string,
): string {
  const baseIndent = lineIndent(source, object.start);
  const propertyIndent =
    object.members.length === 0
      ? baseIndent + indent
      : lineIndent(source, object.members[0]!.propertyStart) || baseIndent + indent;
  const property = renderProperty(key, value, propertyIndent, indent, eol);
  if (object.members.length === 0) {
    return `${source.slice(0, object.start + 1)}${eol}${propertyIndent}${property}${eol}${baseIndent}${source.slice(object.end)}`;
  }
  const last = object.members.at(-1)!;
  const trailing = source.slice(last.valueEnd, object.end);
  const closingWhitespace = trailing.includes("\n") ? trailing : `${eol}${baseIndent}`;
  return `${source.slice(0, last.valueEnd)},${eol}${propertyIndent}${property}${closingWhitespace}${source.slice(object.end)}`;
}

function encodeConfig(document: ParsedAntigravityConfig, source: string): Uint8Array {
  const withoutFinal = source.replace(/(?:\r\n|\n)+$/u, "");
  const finalSource = document.finalNewline ? `${withoutFinal}${document.eol}` : withoutFinal;
  const encoded = new TextEncoder().encode(finalSource);
  if (!document.bom) return encoded;
  const result = new Uint8Array(encoded.length + 3);
  result.set([0xef, 0xbb, 0xbf]);
  result.set(encoded, 3);
  return result;
}

function mcpObject(document: ParsedAntigravityConfig): {
  readonly member?: JsonMemberSpan;
  readonly span?: JsonObjectSpan;
} {
  const member = document.rootSpan.members.find((candidate) => candidate.key === "mcpServers");
  if (member === undefined) return {};
  if (document.source[member.valueStart] !== "{") {
    throw new AntigravityConfigSyntaxError("Antigravity mcpServers must be a JSON object.");
  }
  return { member, span: scanObject(document.source, member.valueStart) };
}

function parsedMemberValue(document: ParsedAntigravityConfig, member: JsonMemberSpan): unknown {
  return JSON.parse(document.source.slice(member.valueStart, member.valueEnd)) as unknown;
}

export function prepareAntigravityConfigEdit(
  bytes: Uint8Array | undefined,
  expectedEntry: AntigravityMcpEntry,
  provenOwnedFingerprints: readonly string[] = [],
): AntigravityConfigEditResult {
  const document = decodeConfig(bytes);
  const expectedFingerprint = fingerprintJsonValue(expectedEntry);
  const mcp = mcpObject(document);
  let source: string;
  let action: AntigravityConfigEditAction;
  if (mcp.span === undefined) {
    source = insertMember(
      document.source,
      document.rootSpan,
      "mcpServers",
      { agentfold: expectedEntry },
      document.indent,
      document.eol,
    );
    action = bytes === undefined ? "create" : "insert";
  } else {
    const existing = mcp.span.members.find((candidate) => candidate.key === "agentfold");
    if (existing === undefined) {
      source = insertMember(
        document.source,
        mcp.span,
        "agentfold",
        expectedEntry,
        document.indent,
        document.eol,
      );
      action = bytes === undefined ? "create" : "insert";
    } else {
      const existingFingerprint = fingerprintJsonValue(parsedMemberValue(document, existing));
      if (existingFingerprint === expectedFingerprint) {
        return {
          status: "ready",
          action: "identical",
          bytes: bytes ?? encodeConfig(document, document.source),
          entryFingerprint: expectedFingerprint,
        };
      }
      if (!provenOwnedFingerprints.includes(existingFingerprint)) {
        return {
          status: "collision",
          existingEntryFingerprint: existingFingerprint,
          entryFingerprint: expectedFingerprint,
        };
      }
      const propertyIndent = lineIndent(document.source, existing.propertyStart);
      const replacement = JSON.stringify(expectedEntry, undefined, document.indent).replaceAll(
        "\n",
        document.eol + propertyIndent,
      );
      source = `${document.source.slice(0, existing.valueStart)}${replacement}${document.source.slice(existing.valueEnd)}`;
      action = "update";
    }
  }
  return {
    status: "ready",
    action,
    bytes: encodeConfig(document, source),
    entryFingerprint: expectedFingerprint,
  };
}

function removeMember(source: string, object: JsonObjectSpan, memberIndex: number): string {
  const member = object.members[memberIndex]!;
  if (object.members.length === 1) {
    return `${source.slice(0, object.start + 1)}${source.slice(object.end)}`;
  }
  const next = object.members[memberIndex + 1];
  if (next !== undefined) {
    return `${source.slice(0, member.propertyStart)}${source.slice(next.propertyStart)}`;
  }
  const previous = object.members[memberIndex - 1]!;
  return `${source.slice(0, previous.commaIndex)}${source.slice(member.valueEnd)}`;
}

export function prepareAntigravityConfigRemoval(
  bytes: Uint8Array,
  expectedFingerprint: string,
): AntigravityConfigRemovalResult {
  const document = decodeConfig(bytes);
  const mcp = mcpObject(document);
  if (mcp.span === undefined) return { status: "ready", changed: false, bytes };
  const index = mcp.span.members.findIndex((candidate) => candidate.key === "agentfold");
  if (index < 0) return { status: "ready", changed: false, bytes };
  const existing = mcp.span.members[index]!;
  const existingFingerprint = fingerprintJsonValue(parsedMemberValue(document, existing));
  if (existingFingerprint !== expectedFingerprint) {
    return { status: "collision", existingEntryFingerprint: existingFingerprint };
  }
  return {
    status: "ready",
    changed: true,
    bytes: encodeConfig(document, removeMember(document.source, mcp.span, index)),
  };
}

export function readAntigravityAgentFoldEntry(bytes: Uint8Array): unknown | undefined {
  const document = decodeConfig(bytes);
  const mcp = mcpObject(document);
  const member = mcp.span?.members.find((candidate) => candidate.key === "agentfold");
  return member === undefined ? undefined : parsedMemberValue(document, member);
}
