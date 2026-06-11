import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  mkdirSync(join(storePath, ".."), { recursive: true });
  writeFileSync(storePath, JSON.stringify(store), "utf-8");
}

export function openDb(): void {
  if (store) return;
  storePath = getStorePath();
  store = loadStore();
  log("INFO", "JSON store opened");
}

export function closeDb(): void {
  if (store) {
    saveStore();
    store = null;
  }
}

export function isFtsAvailable(): boolean {
  return false;
}

export function indexDocument(doc: Omit<StoredDocument, "id" | "created_at" | "updated_at">): StoredDocument {
  if (!store) openDb();
  const now = new Date().toISOString();
  const id = generateId();
  const fullDoc: StoredDocument = { ...doc, id, created_at: now, updated_at: now };

  const existingIdx = store!.documents.findIndex((d) => d.id === id);
  if (existingIdx >= 0) {
    store!.documents[existingIdx] = fullDoc;
  } else {
    store!.documents.push(fullDoc);
  }
  saveStore();

  return fullDoc;
}

export function storeEvent(event: Omit<StoredEvent, "id" | "created_at">): StoredEvent {
  if (!store) openDb();
  const now = new Date().toISOString();
  const id = generateId();
  const fullEvent: StoredEvent = { ...event, id, created_at: now };

  store!.events.push(fullEvent);
  saveStore();

  return fullEvent;
}

export function getRecentEvents(projectId: string | null, limit: number = 50): StoredEvent[] {
  if (!store) openDb();
  let filtered = store!.events;
  if (projectId) {
    filtered = filtered.filter((e) => e.project_id === projectId);
  }
  return [...filtered].reverse().slice(0, limit);
}

export function createWriterJob(job: Omit<WriterJob, "id" | "created_at" | "updated_at">): WriterJob {
  if (!store) openDb();
  const now = new Date().toISOString();
  const id = generateId();
  const fullJob: WriterJob = { ...job, id, created_at: now, updated_at: now };

  store!.writer_jobs.push(fullJob);
  saveStore();

  return fullJob;
}

export function updateWriterJob(id: string, status: string, error?: string): void {
  if (!store) openDb();
  const now = new Date().toISOString();
  const job = store!.writer_jobs.find((j) => j.id === id);
  if (job) {
    job.status = status;
    job.error = error || null;
    job.updated_at = now;
    saveStore();
  }
}

export function getPendingWriterJobs(): WriterJob[] {
  if (!store) openDb();
  return store!.writer_jobs
    .filter((j) => j.status === "pending")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
