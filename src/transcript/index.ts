import { readFileSync } from "node:fs";
import { redactSecrets } from "../redaction/index.js";
import { truncate } from "../utils/index.js";

export interface TranscriptEntry {
  role?: string;
  type?: string;
  content?: string;
  tool?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface ParsedTranscript {
  entries: TranscriptEntry[];
  summary: string;
  toolEvents: ToolEvent[];
}

export interface ToolEvent {
  tool: string;
  input: Record<string, unknown>;
  result?: string;
  success: boolean;
  timestamp?: string;
}

const MAX_ENTRY_LENGTH = 2000;

export function parseTranscriptFile(path: string): ParsedTranscript {
  const raw = readFileSync(path, "utf-8");
  return parseTranscript(raw);
}

export function parseTranscript(raw: string): ParsedTranscript {
  const lines = raw.split("\n").filter((l) => l.trim());
  const entries: TranscriptEntry[] = [];
  const toolEvents: ToolEvent[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as TranscriptEntry;
      const sanitized = sanitizeEntry(entry);
      entries.push(sanitized);

      if (sanitized.tool) {
        toolEvents.push({
          tool: sanitized.tool,
          input: (sanitized.tool_input as Record<string, unknown>) || {},
          result: sanitized.tool_result as string | undefined,
          success: sanitized.type !== "tool_error",
          timestamp: sanitized.timestamp as string | undefined,
        });
      }
    } catch {
      // skip malformed lines
    }
  }

  const summary = buildSummary(entries);
  return { entries, summary, toolEvents };
}

function sanitizeEntry(entry: TranscriptEntry): TranscriptEntry {
  const result = { ...entry };
  if (typeof result.content === "string") {
    result.content = truncate(redactSecrets(result.content), MAX_ENTRY_LENGTH);
  }
  if (typeof result.tool_result === "string") {
    result.tool_result = truncate(redactSecrets(result.tool_result), MAX_ENTRY_LENGTH);
  }
  return result;
}

function buildSummary(entries: TranscriptEntry[]): string {
  const toolCounts: Record<string, number> = {};
  let fileOps = 0;
  let bashOps = 0;
  let errors = 0;

  for (const e of entries) {
    if (e.tool) {
      toolCounts[e.tool] = (toolCounts[e.tool] || 0) + 1;
      if (e.tool === "Write" || e.tool === "Edit" || e.tool === "Read") fileOps++;
      if (e.tool === "Bash") bashOps++;
    }
    if (e.type === "tool_error" || e.type === "error") errors++;
  }

  const parts = [`Session: ${entries.length} entries`];
  if (fileOps) parts.push(`${fileOps} file operations`);
  if (bashOps) parts.push(`${bashOps} bash commands`);
  if (errors) parts.push(`${errors} errors`);

  const topTools = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tool, count]) => `${tool}(${count})`)
    .join(", ");
  if (topTools) parts.push(`Top tools: ${topTools}`);

  return parts.join(", ");
}

export function getTranscriptTail(entries: TranscriptEntry[], maxEntries: number = 30): TranscriptEntry[] {
  return entries.slice(-maxEntries);
}
