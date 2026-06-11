import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let testDataDir: string;

beforeEach(() => {
  testDataDir = join(tmpdir(), `cmh-test-handoff-${Date.now()}`);
  mkdirSync(testDataDir, { recursive: true });
  process.env.CLAUDE_PLUGIN_DATA = testDataDir;
});

afterEach(async () => {
  const { closeDb } = await import("../storage/db.js");
  closeDb();
  delete process.env.CLAUDE_PLUGIN_DATA;
  if (existsSync(testDataDir)) rmSync(testDataDir, { recursive: true });
});

describe("handoff", () => {
  it("builds and writes handoff markdown", async () => {
    const { writeMemory, readMemory } = await import("../storage/memory-files.js");
    const { storeEvent } = await import("../storage/db.js");
    const { writeHandoff } = await import("./index.js");

    writeMemory("project", "proj-1", "MEMORY.md", "# Project\nUses node:test.");
    writeMemory("project", "proj-1", "checkpoint.md", "# Checkpoint\nTests are passing.");
    storeEvent({
      session_id: "sess-1",
      project_id: "proj-1",
      event_type: "post_tool_use",
      source: "Bash",
      body_json: JSON.stringify({ input_summary: "npm test" }),
    });

    const markdown = writeHandoff({
      projectId: "proj-1",
      cwd: "/tmp/project",
      branch: "main",
      compactSummary: "Need to continue cleanup.",
    });

    expect(markdown).toContain("Need to continue cleanup");
    expect(markdown).toContain("Uses node:test");
    expect(markdown).toContain("npm test");
    expect(readMemory("project", "proj-1", "handoff.md")).toBe(markdown);
  });
});
