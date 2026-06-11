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
  .action((transcript: string, opts: { retainEvents: string }) => {
    const retainEvents = Math.max(1, Number(opts.retainEvents) || 100);
    const lines = readFileSync(transcript, "utf-8").split("\n").filter((line) => line.trim());
    const cutIndex = Math.max(0, lines.length - retainEvents);
    const keptLines = lines.slice(cutIndex);
    const firstUser = findFirstRealUserMessage(lines.slice(cutIndex));
    const proposedSid = generateId();
    const outputPath = join(dirname(transcript), `${proposedSid}.forged.jsonl`);
    const estimatedTokens = Math.ceil(keptLines.join("\n").length / 4);

    console.log(JSON.stringify({
      mode: "dry-run",
      original_path: transcript,
      output_path: outputPath,
      proposed_sid: proposedSid,
      original_event_count: lines.length,
      kept_event_count: keptLines.length,
      cut_event_count: cutIndex,
      estimated_tokens: estimatedTokens,
      first_real_user_after_cut: firstUser,
      writes_file: false,
      preserves_thinking_blocks: true,
    }, null, 2));
  });

function findFirstRealUserMessage(lines: string[]): string | null {
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as { type?: string; message?: { role?: string; content?: unknown } };
      if (entry.type !== "user" && entry.message?.role !== "user") continue;
      const content = entry.message?.content;
      if (Array.isArray(content) && content.every((item) => item?.type === "tool_result")) continue;
      if (typeof content === "string" && content.trim()) return content.slice(0, 500);
    } catch {
      // skip malformed lines
    }
  }
  return null;
}
