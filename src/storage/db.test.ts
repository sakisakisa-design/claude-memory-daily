import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let testDataDir: string;

beforeEach(() => {
  testDataDir = join(tmpdir(), `cmh-test-db-${Date.now()}`);
  mkdirSync(testDataDir, { recursive: true });
  process.env.CLAUDE_PLUGIN_DATA = testDataDir;
});

afterEach(async () => {
  const { closeDb } = await import("./db.js");
  closeDb();
  delete process.env.CLAUDE_PLUGIN_DATA;
  if (existsSync(testDataDir)) {
    rmSync(testDataDir, { recursive: true });
  }
});

describe("database (JSON store)", () => {
  it("opens store without error", async () => {
    const { openDb } = await import("./db.js");
    openDb();
  });

  it("indexes and retrieves documents", async () => {
    const { openDb, indexDocument } = await import("./db.js");
    openDb();

    const doc = indexDocument({
      scope: "project",
      project_id: "test-proj",
      session_id: null,
      type: "memory-file",
      path: "/test/path",
      title: "Test Document",
      body: "This is a test document body",
      fingerprint: "abc123",
    });

    expect(doc.id).toBeTruthy();
    expect(doc.created_at).toBeTruthy();
    expect(doc.title).toBe("Test Document");
  });

  it("stores and retrieves events", async () => {
    const { openDb, storeEvent, getRecentEvents } = await import("./db.js");
    openDb();

    storeEvent({
      session_id: "sess-1",
      project_id: "proj-1",
      event_type: "post_tool_use",
      source: "Write",
      body_json: JSON.stringify({ tool: "Write" }),
    });

    storeEvent({
      session_id: "sess-1",
      project_id: "proj-1",
      event_type: "post_tool_use",
      source: "Bash",
      body_json: JSON.stringify({ tool: "Bash" }),
    });

    const events = getRecentEvents("proj-1", 10);
    expect(events.length).toBe(2);
    expect(events[0].source).toBe("Bash");
  });

  it("creates and retrieves writer jobs", async () => {
    const { openDb, createWriterJob, getPendingWriterJobs, updateWriterJob } = await import("./db.js");
    openDb();

    createWriterJob({
      session_id: "sess-1",
      project_id: "proj-1",
      status: "pending",
      input_json: JSON.stringify({ test: true }),
      error: null,
    });

    const pending = getPendingWriterJobs();
    expect(pending.length).toBe(1);
    expect(pending[0].status).toBe("pending");

    updateWriterJob(pending[0].id, "completed");
    const afterUpdate = getPendingWriterJobs();
    expect(afterUpdate.length).toBe(0);
  });
});
