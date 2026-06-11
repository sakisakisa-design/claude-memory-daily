import { describe, it, expect } from "vitest";
import { parseTranscript, getTranscriptTail } from "./index.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "..", "fixtures", "transcripts");

describe("transcript parser", () => {
  it("parses simple session", () => {
    const raw = readFileSync(join(fixturesDir, "simple-session.jsonl"), "utf-8");
    const result = parseTranscript(raw);

    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.summary).toContain("Session:");
    expect(result.toolEvents.length).toBeGreaterThan(0);
  });

  it("parses tool-heavy session", () => {
    const raw = readFileSync(join(fixturesDir, "tool-heavy-session.jsonl"), "utf-8");
    const result = parseTranscript(raw);

    expect(result.entries.length).toBe(9);
    expect(result.toolEvents.length).toBeGreaterThan(0);
    expect(result.toolEvents.some((e) => !e.success)).toBe(true);
  });

  it("handles malformed lines gracefully", () => {
    const raw = readFileSync(join(fixturesDir, "malformed-lines.jsonl"), "utf-8");
    const result = parseTranscript(raw);

    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.entries.length).toBeLessThan(10);
  });

  it("redacts secrets in transcript entries", () => {
    const raw = readFileSync(join(fixturesDir, "malformed-lines.jsonl"), "utf-8");
    const result = parseTranscript(raw);

    const allContent = result.entries.map((e) => e.content || "").join(" ");
    expect(allContent).not.toContain("sk-proj-abc123secretkey");
  });

  it("returns transcript tail", () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      role: "user",
      content: `message ${i}`,
    }));

    const tail = getTranscriptTail(entries, 10);
    expect(tail.length).toBe(10);
    expect(tail[0].content).toBe("message 90");
  });

  it("builds session summary", () => {
    const raw = readFileSync(join(fixturesDir, "tool-heavy-session.jsonl"), "utf-8");
    const result = parseTranscript(raw);

    expect(result.summary).toContain("file operations");
    expect(result.summary).toContain("bash commands");
  });

  it("parses real Claude Code message content tool shapes", () => {
    const raw = readFileSync(join(fixturesDir, "claude-code-real-session.jsonl"), "utf-8");
    const result = parseTranscript(raw);

    expect(result.entries).toHaveLength(9);
    expect(result.entries[0].unknown_field).toEqual({ preserve: true });
    expect(result.entries[7].vendor_extra).toEqual({ preserve: "opaque" });
    expect(JSON.stringify(result.entries[7])).toContain("thinking");
    expect(result.toolEvents.map((event) => event.tool)).toEqual(["Write", "Bash", "Bash", "Read"]);
    expect(result.toolEvents[0].result).toContain("File created successfully");
    expect(result.toolEvents[1].success).toBe(false);
    expect(result.toolEvents[2].success).toBe(true);
    expect(result.toolEvents[3].result).toContain("module");
    expect(result.summary).toContain("2 file operations");
    expect(result.summary).toContain("2 bash commands");
    expect(result.summary).toContain("1 errors");
  });

  it("redacts nested real Claude Code transcript fields", () => {
    const raw = readFileSync(join(fixturesDir, "claude-code-real-session.jsonl"), "utf-8");
    const result = parseTranscript(raw);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("sk-proj-abc123def456ghi789jkl012mno345pqr678");
    expect(serialized).toContain("[REDACTED]");
  });

  it("returns redacted transcript tail for real Claude Code entries", () => {
    const raw = readFileSync(join(fixturesDir, "claude-code-real-session.jsonl"), "utf-8");
    const result = parseTranscript(raw);
    const tail = getTranscriptTail(result.entries, 2);
    const serialized = JSON.stringify(tail);

    expect(tail).toHaveLength(2);
    expect(serialized).not.toContain("sk-proj-abc123def456ghi789jkl012mno345pqr678");
    expect(serialized).toContain("[REDACTED]");
  });

  it("truncates long transcript entry content", () => {
    const raw = JSON.stringify({
      type: "user",
      message: { role: "user", content: "x".repeat(5000) },
      content: "x".repeat(5000),
    });
    const result = parseTranscript(raw);

    expect(result.entries[0].content?.length).toBeLessThan(2500);
    expect(result.entries[0].content).toContain("[truncated]");
  });
});
