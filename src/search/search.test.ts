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
  it("tokenizes Chinese prompts into bigrams", async () => {
    const { tokenize } = await import("./index.js");
    expect(tokenize("登录测试失败")).toEqual(["登录", "录测", "测试", "试失", "失败"]);
    expect(tokenize("JWT认证失败")).toEqual(["jwt", "认证", "证失", "失败"]);
  });

  it("searches memory files with plain text fallback", async () => {
    const { writeMemory } = await import("../storage/memory-files.js");
    const { searchMemory } = await import("./index.js");

    writeMemory("project", "proj-1", "MEMORY.md", "# Auth Module\nUses JWT tokens for authentication.\nRefresh tokens expire in 7 days.");
    writeMemory("project", "proj-1", "notes.md", "# Notes\nRemember to update the login page.");

    const results = searchMemory("JWT authentication", "proj-1");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].body).toContain("JWT");
  });

  it("searches Chinese memory without whitespace in the prompt", async () => {
    const { writeMemory } = await import("../storage/memory-files.js");
    const { searchMemory } = await import("./index.js");

    writeMemory("project", "proj-zh", "MEMORY.md", "# 登录模块\n登录测试失败时要先检查会话续期和验证码逻辑。");

    const results = searchMemory("登录测试失败怎么办", "proj-zh");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].body).toContain("登录测试失败");
  });

  it("returns empty results when no match", async () => {
    const { searchMemory } = await import("./index.js");
    const results = searchMemory("nonexistent topic xyz", "proj-none");
    expect(results.length).toBe(0);
  });

  it("searches Chinese indexed documents", async () => {
    const { indexDocument } = await import("../storage/db.js");
    const { searchMemory } = await import("./index.js");

    indexDocument({
      scope: "project",
      project_id: "proj-zh",
      session_id: "sess-zh",
      type: "summary",
      path: null,
      title: "支付摘要",
      body: "支付重试流程需要保留幂等键，并记录失败原因。",
      fingerprint: "summary-zh",
    });

    const results = searchMemory("支付重试失败", "proj-zh");
    expect(results.some((result) => result.type === "summary" && result.body.includes("幂等键"))).toBe(true);
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
