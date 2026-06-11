import { Command } from "commander";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { generateId } from "../../utils/index.js";

export const forgeCmd = new Command("forge")
  .description("Experimental transcript forge utilities");

forgeCmd
  .command("dry-run <transcript>")
  .description("Inspect a transcript and report a safe forge plan without writing files")
  .option("--retain-events <count>", "number of trailing JSONL events to retain", "100")
  .option("--retain-tokens <count>", "approximate number of tail tokens to retain")
  .action((transcript: string, opts: { retainEvents: string; retainTokens?: string }) => {
    const retainEvents = Math.max(1, Number(opts.retainEvents) || 100);
    const retainTokens = opts.retainTokens ? Math.max(1, Number(opts.retainTokens) || 0) : null;
    const lines = readFileSync(transcript, "utf-8").split("\n").filter((line) => line.trim());
    const parsed = lines.map(parseLine);
    const eventCutIndex = Math.max(0, lines.length - retainEvents);
    const tokenCutIndex = retainTokens ? findTokenCutIndex(lines, retainTokens) : eventCutIndex;
    const cutIndex = Math.max(eventCutIndex, tokenCutIndex);
    const keptLines = lines.slice(cutIndex);
    const firstUserInfo = findFirstRealUserMessage(parsed.slice(cutIndex), cutIndex);
    const proposedSid = generateId();
    const outputPath = join(dirname(transcript), `${proposedSid}.forged.jsonl`);
    const estimatedTokens = Math.ceil(keptLines.join("\n").length / 4);
    const recommendedKeepStartIndex = firstUserInfo?.index ?? cutIndex;
    const warnings = buildWarnings(parsed, cutIndex, recommendedKeepStartIndex);

    console.log(JSON.stringify({
      mode: "dry-run",
      original_path: transcript,
      output_path: outputPath,
      proposed_sid: proposedSid,
      original_event_count: lines.length,
      kept_event_count: keptLines.length,
      cut_event_count: cutIndex,
      retain_events: retainEvents,
      retain_tokens: retainTokens,
      estimated_tokens: estimatedTokens,
      recommended_keep_start_index: recommendedKeepStartIndex,
      first_real_user_after_cut: firstUserInfo?.content ?? null,
      first_kept_event_kind: classifyEntry(parsed[cutIndex]),
      unknown_field_keys_after_cut: countUnknownKeys(parsed.slice(cutIndex)),
      warnings,
      writes_file: false,
      preserves_thinking_blocks: true,
    }, null, 2));
  });

function parseLine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function findTokenCutIndex(lines: string[], retainTokens: number): number {
  let tokens = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    tokens += Math.ceil(lines[i].length / 4);
    if (tokens >= retainTokens) return i;
  }
  return 0;
}

function findFirstRealUserMessage(entries: Array<Record<string, unknown> | null>, offset: number): { index: number; content: string } | null {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as { type?: string; message?: { role?: string; content?: unknown } } | null;
    if (!entry || (entry.type !== "user" && entry.message?.role !== "user")) continue;
    const content = entry.message?.content;
    if (Array.isArray(content) && content.every(isToolResultBlock)) continue;
    if (typeof content === "string" && content.trim()) return { index: offset + i, content: content.slice(0, 500) };
  }
  return null;
}

function buildWarnings(entries: Array<Record<string, unknown> | null>, cutIndex: number, recommendedKeepStartIndex: number): string[] {
  const warnings: string[] = [];
  const kind = classifyEntry(entries[cutIndex]);
  if (kind === "tool_result" || kind === "meta" || kind === "assistant") {
    warnings.push(`cut starts with ${kind}; prefer starting at the next real user message`);
  }
  if (recommendedKeepStartIndex > cutIndex) {
    warnings.push(`recommended_keep_start_index advanced from ${cutIndex} to ${recommendedKeepStartIndex}`);
  }
  if (!entries[cutIndex]) {
    warnings.push("cut starts with malformed JSON");
  }
  return warnings;
}

function classifyEntry(entry: Record<string, unknown> | null | undefined): string {
  if (!entry) return "malformed";
  if (entry.type === "queue-operation" || entry.type === "attachment") return "meta";
  const message = entry.message as { role?: string; content?: unknown } | undefined;
  const content = message?.content;
  if (message?.role === "assistant" || entry.type === "assistant") return "assistant";
  if (Array.isArray(content) && content.every(isToolResultBlock)) return "tool_result";
  if (message?.role === "user" || entry.type === "user") return "user";
  return typeof entry.type === "string" ? entry.type : "unknown";
}

function isToolResultBlock(item: unknown): boolean {
  return !!item && typeof item === "object" && (item as { type?: unknown }).type === "tool_result";
}

function countUnknownKeys(entries: Array<Record<string, unknown> | null>): Record<string, number> {
  const known = new Set(["type", "message", "timestamp", "uuid", "parentUuid", "isSidechain", "cwd", "sessionId", "version"]);
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry) continue;
    for (const key of Object.keys(entry)) {
      if (!known.has(key)) counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}
