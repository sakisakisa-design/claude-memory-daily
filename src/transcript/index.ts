import { readFileSync } from "node:fs";
import { redactText, redactValue } from "../redaction/index.js";
import { truncate } from "../utils/index.js";

export interface TranscriptEntry {
  role?: string;
  type?: string;
  content?: string;
  tool?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  tool_result?: string;
  error?: unknown;
  timestamp?: string;
  [key: string]: unknown;
}

export interface ParsedTranscript {
  entries: TranscriptEntry[];
  summary: string;
  toolEvents: ToolEvent[];
}

export interface ToolEvent {
  toolUseId?: string;
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
  const toolEventsById = new Map<string, ToolEvent>();

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as TranscriptEntry;
      const sanitized = sanitizeEntry(entry);
      entries.push(sanitized);

      extractToolEvents(sanitized, toolEvents, toolEventsById);
    } catch {
      // skip malformed lines
    }
  }

  const summary = buildSummary(entries, toolEvents);
  return { entries, summary, toolEvents };
}

function sanitizeEntry(entry: TranscriptEntry): TranscriptEntry {
  const result = redactValue({ ...entry });
  if (typeof result.content === "string") {
    result.content = truncate(redactText(result.content), MAX_ENTRY_LENGTH);
  }
  if (typeof result.tool_result === "string") {
    result.tool_result = truncate(redactText(result.tool_result), MAX_ENTRY_LENGTH);
  }
  if (typeof result.tool_response === "string") {
    result.tool_response = truncate(redactText(result.tool_response), MAX_ENTRY_LENGTH);
  }
  if (typeof result.error === "string") {
    result.error = truncate(redactText(result.error), MAX_ENTRY_LENGTH);
  }
  return result;
}

function extractToolEvents(
  entry: TranscriptEntry,
  toolEvents: ToolEvent[],
  toolEventsById: Map<string, ToolEvent>
): void {
  const timestamp = entry.timestamp as string | undefined;
  if (entry.tool) {
    toolEvents.push({
      tool: entry.tool,
      input: (entry.tool_input as Record<string, unknown>) || {},
      result: entry.tool_result as string | undefined,
      success: entry.type !== "tool_error",
      timestamp,
    });
  }

  const message = entry.message as { content?: unknown } | undefined;
  const content = message?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const block = item as Record<string, unknown>;
      if (block.type === "tool_use") {
        const toolUseId = typeof block.id === "string" ? block.id : undefined;
        const toolEvent: ToolEvent = {
          toolUseId,
          tool: typeof block.name === "string" ? block.name : "unknown",
          input: isRecord(block.input) ? block.input : {},
          success: true,
          timestamp,
        };
        toolEvents.push(toolEvent);
        if (toolUseId) toolEventsById.set(toolUseId, toolEvent);
      } else if (block.type === "tool_result") {
        const toolUseId = typeof block.tool_use_id === "string" ? block.tool_use_id : undefined;
        const existing = toolUseId ? toolEventsById.get(toolUseId) : undefined;
        if (existing) {
          existing.result = stringifyContent(block.content);
          existing.success = block.is_error !== true;
        }
      }
    }
  }

  if (entry.toolUseResult !== undefined && typeof entry.sourceToolAssistantUUID === "string") {
    const existing = toolEventsById.get(entry.sourceToolAssistantUUID);
    if (existing) {
      existing.result = stringifyContent(entry.toolUseResult);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringifyContent(value: unknown): string {
  if (typeof value === "string") return truncate(redactText(value), MAX_ENTRY_LENGTH);
  return truncate(redactText(JSON.stringify(redactValue(value))), MAX_ENTRY_LENGTH);
}

function buildSummary(entries: TranscriptEntry[], toolEvents: ToolEvent[]): string {
  const toolCounts: Record<string, number> = {};
  let fileOps = 0;
  let bashOps = 0;
  let errors = 0;

  for (const event of toolEvents) {
    toolCounts[event.tool] = (toolCounts[event.tool] || 0) + 1;
    if (event.tool === "Write" || event.tool === "Edit" || event.tool === "Read") fileOps++;
    if (event.tool === "Bash") bashOps++;
    if (!event.success) errors++;
  }

  for (const e of entries) {
    if (!e.tool && (e.type === "tool_error" || e.type === "error")) {
      errors++;
    }
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
