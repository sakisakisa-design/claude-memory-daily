import { join } from "node:path";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { getDataDir } from "../config/index.js";
import { generateId, log } from "../utils/index.js";

export interface StoredDocument {
  id: string;
  scope: string;
  project_id: string | null;
  session_id: string | null;
  type: string;
  path: string | null;
  title: string;
  body: string;
  fingerprint: string;
  created_at: string;
  updated_at: string;
}

export interface StoredEvent {
  id: string;
  session_id: string | null;
  project_id: string | null;
  event_type: string;
  source: string;
  body_json: string;
  created_at: string;
}

export interface WriterJob {
  id: string;
  session_id: string | null;
  project_id: string | null;
  status: string;
  input_json: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface Store {
  documents: StoredDocument[];
  events: StoredEvent[];
  writer_jobs: WriterJob[];
}

let store: Store | null = null;
let storePath: string = "";
const LOCK_TIMEOUT_MS = 5000;

function getStorePath(): string {
  return join(getDataDir(), "store.json");
}

function loadStore(): Store {
  if (!storePath) storePath = getStorePath();
  if (!existsSync(storePath)) {
    return { documents: [], events: [], writer_jobs: [] };
  }
  try {
    const raw = readFileSync(storePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { documents: [], events: [], writer_jobs: [] };
  }
}

function saveStore(): void {
  if (!store) return;
  if (!storePath) storePath = getStorePath();
  writeStoreAtomic(storePath, store);
}

function writeStoreAtomic(path: string, value: Store): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(value), "utf-8");
  const fd = openSync(tmpPath, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, path);
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withStoreLock<T>(fn: () => T): T {
  if (!storePath) storePath = getStorePath();
  const lockPath = `${storePath}.lock`;
  mkdirSync(join(storePath, ".."), { recursive: true });
  const started = Date.now();
  while (true) {
    try {
      mkdirSync(lockPath, { recursive: false });
      break;
    } catch {
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for JSON store lock: ${lockPath}`);
      }
      sleepSync(25);
    }
  }

  try {
    store = loadStore();
    return fn();
  } finally {
    try {
      rmSync(lockPath, { recursive: true, force: true });
    } catch {
      // ignore lock cleanup failures
    }
  }
}

function mutateStore<T>(fn: (current: Store) => T): T {
  return withStoreLock(() => {
    const current = store!;
    const result = fn(current);
    writeStoreAtomic(storePath, current);
    return result;
  });
}

export function openDb(): void {
  if (store) return;
  storePath = getStorePath();
  store = loadStore();
  log("INFO", "JSON store opened");
}

export function closeDb(): void {
  store = null;
}

export function isFtsAvailable(): boolean {
  return false;
}

export function indexDocument(doc: Omit<StoredDocument, "id" | "created_at" | "updated_at">): StoredDocument {
  return mutateStore((current) => {
    const now = new Date().toISOString();
    const existingIdx = current.documents.findIndex((d) =>
      d.scope === doc.scope &&
      d.project_id === doc.project_id &&
      d.type === doc.type &&
      d.path === doc.path &&
      d.fingerprint === doc.fingerprint
    );
    if (existingIdx >= 0) {
      const existing = current.documents[existingIdx];
      const fullDoc: StoredDocument = {
        ...doc,
        id: existing.id,
        created_at: existing.created_at,
        updated_at: now,
      };
      current.documents[existingIdx] = fullDoc;
      return fullDoc;
    }

    const fullDoc: StoredDocument = { ...doc, id: generateId(), created_at: now, updated_at: now };
    current.documents.push(fullDoc);
    return fullDoc;
  });
}

export function storeEvent(event: Omit<StoredEvent, "id" | "created_at">): StoredEvent {
  return mutateStore((current) => {
    const now = new Date().toISOString();
    const fullEvent: StoredEvent = { ...event, id: generateId(), created_at: now };
    current.events.push(fullEvent);
    return fullEvent;
  });
}

export function getRecentEvents(projectId: string | null, limit: number = 50): StoredEvent[] {
  if (!store) openDb();
  let filtered = store!.events;
  if (projectId) {
    filtered = filtered.filter((e) => e.project_id === projectId);
  }
  return [...filtered].reverse().slice(0, limit);
}

export function getIndexedDocuments(projectId?: string, limit: number = 1000): StoredDocument[] {
  if (!store) openDb();
  const filtered = store!.documents.filter((doc) =>
    doc.scope === "global" || !projectId || doc.project_id === projectId
  );
  return [...filtered]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, limit);
}

export function createWriterJob(job: Omit<WriterJob, "id" | "created_at" | "updated_at">): WriterJob {
  return mutateStore((current) => {
    const now = new Date().toISOString();
    const fullJob: WriterJob = { ...job, id: generateId(), created_at: now, updated_at: now };
    current.writer_jobs.push(fullJob);
    return fullJob;
  });
}

export function updateWriterJob(id: string, status: string, error?: string): void {
  mutateStore((current) => {
    const now = new Date().toISOString();
    const job = current.writer_jobs.find((j) => j.id === id);
    if (job) {
      job.status = status;
      job.error = error || null;
      job.updated_at = now;
    }
  });
}

export function getPendingWriterJobs(): WriterJob[] {
  if (!store) openDb();
  return store!.writer_jobs
    .filter((j) => j.status === "pending")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function getWriterJob(id: string): WriterJob | undefined {
  if (!store) openDb();
  return store!.writer_jobs.find((j) => j.id === id);
}

export function getRecentWriterJobs(projectId: string | null, sessionId: string | null, limit: number = 20): WriterJob[] {
  if (!store) openDb();
  return store!.writer_jobs
    .filter((j) =>
      (projectId === null || j.project_id === projectId) &&
      (sessionId === null || j.session_id === sessionId)
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}
