import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readdirSync, writeFileSync, utimesSync } from "node:fs";
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

  it("preserves concurrent event and writer job writes", async () => {
    const { storeEvent, getRecentEvents, createWriterJob, getPendingWriterJobs } = await import("./db.js");

    await Promise.all(Array.from({ length: 25 }, async (_, i) => {
      storeEvent({
        session_id: `sess-${i}`,
        project_id: "proj-concurrent",
        event_type: "post_tool_use",
        source: "Bash",
        body_json: JSON.stringify({ i }),
      });
      createWriterJob({
        session_id: `sess-${i}`,
        project_id: "proj-concurrent",
        status: "pending",
        input_json: JSON.stringify({ i }),
        error: null,
      });
    }));

    expect(getRecentEvents("proj-concurrent", 100)).toHaveLength(25);
    expect(getPendingWriterJobs().filter((job) => job.project_id === "proj-concurrent")).toHaveLength(25);
    expect(readdirSync(testDataDir).some((name) => name.endsWith(".tmp") || name.endsWith(".lock"))).toBe(false);
  });

  it("preserves concurrent writer job updates", async () => {
    const { createWriterJob, updateWriterJob, getPendingWriterJobs, getRecentWriterJobs } = await import("./db.js");
    const jobs = Array.from({ length: 20 }, (_, i) => createWriterJob({
      session_id: `sess-update-${i}`,
      project_id: "proj-updates",
      status: "pending",
      input_json: JSON.stringify({ i }),
      error: null,
    }));

    await Promise.all(jobs.map(async (job, i) => {
      updateWriterJob(job.id, "completed", `done-${i}`);
    }));

    expect(getPendingWriterJobs().filter((job) => job.project_id === "proj-updates")).toHaveLength(0);
    expect(getRecentWriterJobs("proj-updates", null, 100).filter((job) => job.status === "completed")).toHaveLength(20);
  });

  it("recovers stale locks", async () => {
    const { storeEvent, getRecentEvents } = await import("./db.js");
    const { saveConfig, loadConfig } = await import("../config/index.js");
    const config = loadConfig();
    config.storage.lockStaleMs = 1;
    saveConfig(config);

    const lockPath = join(testDataDir, "store.json.lock");
    mkdirSync(lockPath, { recursive: true });
    const old = new Date(Date.now() - 60_000);
    utimesSync(lockPath, old, old);

    storeEvent({
      session_id: "sess-stale",
      project_id: "proj-stale",
      event_type: "post_tool_use",
      source: "Bash",
      body_json: "{}",
    });

    expect(existsSync(lockPath)).toBe(false);
    expect(getRecentEvents("proj-stale", 10)).toHaveLength(1);
  });

  it("quarantines corrupt JSON store before creating a fresh store", async () => {
    const { closeDb, storeEvent, getRecentEvents } = await import("./db.js");
    writeFileSync(join(testDataDir, "store.json"), "{bad json", "utf-8");
    closeDb();

    storeEvent({
      session_id: "sess-corrupt",
      project_id: "proj-corrupt",
      event_type: "post_tool_use",
      source: "Bash",
      body_json: "{}",
    });

    expect(readdirSync(testDataDir).some((name) => name.startsWith("store.json.corrupt."))).toBe(true);
    expect(getRecentEvents("proj-corrupt", 10)).toHaveLength(1);
  });
});
