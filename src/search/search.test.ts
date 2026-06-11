import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let testDataDir: string;

beforeEach(() => {
  testDataDir = join(tmpdir(), `cmh-test-search-${Date.now()}`);
  mkdirSync(testDataDir, { recursive: true });
  process.env.CLAUDE_PLUGIN_DATA = testDataDir;
});

afterEach(async () => {
  try {
    const { closeDb } = await import("../storage/db.js");
    closeDb();
  } catch {}
  delete process.env.CLAUDE_PLUGIN_DATA;
  if (existsSync(testDataDir)) {
    rmSync(testDataDir, { recursive: true });
  }
});

describe("search", () => {
  it("searches memory files with plain text fallback", async () => {
    const { writeMemory } = await import("../storage/memory-files.js");
    const { searchMemory } = await import("./index.js");

    writeMemory("project", "proj-1", "MEMORY.md", "# Auth Module\nUses JWT tokens for authentication.\nRefresh tokens expire in 7 days.");
    writeMemory("project", "proj-1", "notes.md", "# Notes\nRemember to update the login page.");

    const results = searchMemory("JWT authentication", "proj-1");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].body).toContain("JWT");
  });

  it("returns empty results when no match", async () => {
    const { searchMemory } = await import("./index.js");
    const results = searchMemory("nonexistent topic xyz", "proj-none");
    expect(results.length).toBe(0);
  });

  it("searches indexed documents from the JSON store", async () => {
    const { indexDocument } = await import("../storage/db.js");
    const { searchMemory } = await import("./index.js");

    indexDocument({
      scope: "project",
      project_id: "proj-1",
      session_id: "sess-1",
      type: "summary",
      path: null,
      title: "Checkpoint Summary",
      body: "The payment retry flow uses idempotency keys for Stripe requests.",
      fingerprint: "summary-1",
    });

    const results = searchMemory("Stripe idempotency", "proj-1");
    expect(results.some((result) => result.type === "summary" && result.body.includes("idempotency"))).toBe(true);
  });

  it("builds memory context with budget", async () => {
    const { writeMemory } = await import("../storage/memory-files.js");
    const { getMemoryContext } = await import("./index.js");

    writeMemory("project", "proj-1", "MEMORY.md", "# Project\nThis is a test project.");
    writeMemory("project", "proj-1", "checkpoint.md", "# Checkpoint\nTask: implement feature X.");

    const context = getMemoryContext("proj-1", 1000);
    expect(context.length).toBeLessThanOrEqual(1000);
    expect(context).toContain("Project");
  });
});
