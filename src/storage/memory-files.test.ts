import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let testDataDir: string;

beforeEach(() => {
  testDataDir = join(tmpdir(), `cmh-test-memory-${Date.now()}`);
  mkdirSync(testDataDir, { recursive: true });
  process.env.CLAUDE_PLUGIN_DATA = testDataDir;
});

afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA;
  if (existsSync(testDataDir)) {
    rmSync(testDataDir, { recursive: true });
  }
});

describe("memory-files", () => {
  it("reads empty string for non-existent file", async () => {
    const { readMemory } = await import("./memory-files.js");
    expect(readMemory("global", undefined, "MEMORY.md")).toBe("");
  });

  it("writes and reads global memory", async () => {
    const { readMemory, writeMemory } = await import("./memory-files.js");
    writeMemory("global", undefined, "MEMORY.md", "# Global Memory\nTest content");
    const content = readMemory("global", undefined, "MEMORY.md");
    expect(content).toContain("Test content");
  });

  it("writes and reads project memory", async () => {
    const { readMemory, writeMemory } = await import("./memory-files.js");
    writeMemory("project", "test-project-1", "MEMORY.md", "# Project Memory\nProject content");
    const content = readMemory("project", "test-project-1", "MEMORY.md");
    expect(content).toContain("Project content");
  });

  it("creates backup before overwriting", async () => {
    const { readMemory, writeMemory, getMemoryPath } = await import("./memory-files.js");
    writeMemory("global", undefined, "MEMORY.md", "original content");
    writeMemory("global", undefined, "MEMORY.md", "new content");

    const path = getMemoryPath("global", undefined, "MEMORY.md");
    const backup = readFileSync(path + ".bak", "utf-8");
    expect(backup).toBe("original content");
    expect(readMemory("global", undefined, "MEMORY.md")).toBe("new content");
  });

  it("appends to memory", async () => {
    const { readMemory, writeMemory, appendMemory } = await import("./memory-files.js");
    writeMemory("global", undefined, "MEMORY.md", "line 1");
    appendMemory("global", undefined, "MEMORY.md", "line 2");
    const content = readMemory("global", undefined, "MEMORY.md");
    expect(content).toContain("line 1");
    expect(content).toContain("line 2");
  });

  it("lists memory files", async () => {
    const { writeMemory, listMemoryFiles } = await import("./memory-files.js");
    writeMemory("global", undefined, "MEMORY.md", "global content");
    writeMemory("project", "proj-1", "MEMORY.md", "project content");
    writeMemory("project", "proj-1", "checkpoint.md", "checkpoint content");

    const files = listMemoryFiles("proj-1");
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.some((f) => f.scope === "global" && f.name === "MEMORY.md")).toBe(true);
    expect(files.some((f) => f.scope === "project" && f.name === "checkpoint.md")).toBe(true);
  });
});
