import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let testDataDir: string;

beforeEach(() => {
  testDataDir = join(tmpdir(), `cmh-test-inject-${Date.now()}`);
  mkdirSync(testDataDir, { recursive: true });
  process.env.CLAUDE_PLUGIN_DATA = testDataDir;
});

afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA;
  if (existsSync(testDataDir)) {
    rmSync(testDataDir, { recursive: true });
  }
});

describe("inject", () => {
  it("returns empty string when no memory exists", async () => {
    const { buildSessionContext } = await import("./index.js");
    const context = buildSessionContext("nonexistent-project");
    expect(context).toBe("");
  });

  it("builds session context with project memory", async () => {
    const { writeMemory } = await import("../storage/memory-files.js");
    const { buildSessionContext } = await import("./index.js");

    writeMemory("project", "test-proj", "MEMORY.md", "# Auth\nUses JWT tokens");
    writeMemory("project", "test-proj", "checkpoint.md", "# Task\nFixing login");

    const context = buildSessionContext("test-proj");
    expect(context).toContain("claude-memory-harness");
    expect(context).toContain("JWT tokens");
    expect(context).toContain("Fixing login");
    expect(context).toContain("helpful context");
  });

  it("respects character budget", async () => {
    const { writeMemory } = await import("../storage/memory-files.js");
    const { buildSessionContext } = await import("./index.js");

    const longContent = "x".repeat(20000);
    writeMemory("project", "test-proj", "MEMORY.md", longContent);

    const context = buildSessionContext("test-proj");
    expect(context.length).toBeLessThanOrEqual(13000);
  });

  it("includes global memory when present", async () => {
    const { writeMemory } = await import("../storage/memory-files.js");
    const { buildSessionContext } = await import("./index.js");

    writeMemory("global", undefined, "MEMORY.md", "# Global\nPrefer TypeScript");

    const context = buildSessionContext("any-project");
    expect(context).toContain("Global Memory");
    expect(context).toContain("TypeScript");
  });
});
