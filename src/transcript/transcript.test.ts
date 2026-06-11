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
});
