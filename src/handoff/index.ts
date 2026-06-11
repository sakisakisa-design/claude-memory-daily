import { readMemory, writeMemory } from "../storage/memory-files.js";
import { getRecentEvents } from "../storage/db.js";
import { loadConfig } from "../config/index.js";
import { parseTranscriptFile, getTranscriptTail } from "../transcript/index.js";
import { redactText, redactValue } from "../redaction/index.js";
import { truncate } from "../utils/index.js";

export interface HandoffInput {
  projectId: string;
  sessionId?: string | null;
  cwd: string;
  branch: string | null;
  compactSummary?: string;
  transcriptPath?: string;
}

export function buildHandoffMarkdown(input: HandoffInput): string {
  const config = loadConfig();
  const projectMemory = readMemory("project", input.projectId, "MEMORY.md");
  const checkpoint = readMemory("project", input.projectId, "checkpoint.md");
  const notes = readMemory("project", input.projectId, "notes.md");
  const events = getRecentEvents(input.projectId, 20);
  const transcriptTail = readTranscriptTail(input.transcriptPath, config.handoff.maxTranscriptEntries);

  const sections = [
    "# Handoff",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Project: ${input.projectId}`,
    `CWD: ${input.cwd}`,
    `Branch: ${input.branch || "unknown"}`,
  ];

  if (input.compactSummary?.trim()) {
    sections.push("", "## Compact Summary", truncate(redactText(input.compactSummary), 4000));
  }
  if (projectMemory.trim()) {
    sections.push("", "## Project Memory", projectMemory.trim());
  }
  if (checkpoint.trim()) {
    sections.push("", "## Checkpoint", checkpoint.trim());
  }
  if (notes.trim()) {
    sections.push("", "## Notes", notes.trim());
  }
  if (events.length) {
    sections.push("", "## Recent Events", ...events.map(formatEvent));
  }
  if (transcriptTail) {
    sections.push("", "## Transcript Tail", transcriptTail);
  }

  return truncate(sections.join("\n"), config.handoff.maxChars);
}

export function writeHandoff(input: HandoffInput): string {
  const markdown = buildHandoffMarkdown(input);
  writeMemory("project", input.projectId, "handoff.md", markdown);
  return markdown;
}

function formatEvent(event: ReturnType<typeof getRecentEvents>[number]): string {
  try {
    const body = JSON.parse(event.body_json) as Record<string, unknown>;
    const summary = body.input_summary || body.output_summary || body.error_summary || "";
    return `- ${event.event_type} ${event.source}: ${truncate(String(summary), 300)}`;
  } catch {
    return `- ${event.event_type} ${event.source}`;
  }
}

function readTranscriptTail(path: string | undefined, maxEntries: number): string {
  if (!path) return "";
  try {
    const parsed = parseTranscriptFile(path);
    return truncate(redactText(JSON.stringify(redactValue(getTranscriptTail(parsed.entries, maxEntries)), null, 2)), 5000);
  } catch {
    return "";
  }
}
