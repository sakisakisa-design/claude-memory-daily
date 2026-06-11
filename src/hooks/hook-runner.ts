import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  loadConfig,
  ensureDataDir,
  initLogger,
  log,
  resolveProjectId,
  buildSessionContext,
  buildPromptContext,
  storeEvent,
  readMemory,
  writeMemory,
  callWriter,
  getRecentEvents,
  createWriterJob,
  updateWriterJob,
  getWriterJob,
  getRecentWriterJobs,
  indexDocument,
  sha256,
  redactText,
  redactValue,
  truncate,
  closeDb,
  resolveApiKey,
  parseTranscriptFile,
  getTranscriptTail,
  applyMemoryPatch,
} from "../index.js";
import type { ProjectInfo, WriterInput, WriterOutput } from "../index.js";

interface HookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  tool_output?: unknown;
  error?: unknown;
  tool_error?: unknown;
  prompt?: string;
  user_prompt?: string;
  transcript_path?: string;
  compact_summary?: string;
  compacted_summary?: string;
  summary?: string;
  stop_hook_active?: boolean;
  [key: string]: unknown;
}

const STOP_THROTTLE_MS = 10 * 60 * 1000;
const SESSION_END_THROTTLE_MS = 30 * 1000;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parseInput(raw: string): HookInput {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function outputJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data) + "\n");
}

async function handleSessionStart(input: HookInput): Promise<void> {
  const dataDir = ensureDataDir();
  initLogger(dataDir);

  const cwd = input.cwd || process.cwd();
  const project = resolveProjectId(cwd);

  log("INFO", "SessionStart", { sessionId: input.session_id, projectId: project.projectId });

  const context = buildSessionContext(project.projectId);
  if (!context) {
    outputJson({});
    return;
  }

  outputJson({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  });
}

async function handleUserPromptSubmit(input: HookInput): Promise<void> {
  const dataDir = ensureDataDir();
  initLogger(dataDir);

  const cwd = input.cwd || process.cwd();
  const project = resolveProjectId(cwd);
  const prompt = input.prompt || input.user_prompt || "";

  log("INFO", "UserPromptSubmit", { sessionId: input.session_id, promptLength: prompt.length });

  if (!prompt.trim()) {
    outputJson({});
    return;
  }

  const context = buildPromptContext(project.projectId, prompt);
  if (!context) {
    outputJson({});
    return;
  }

  outputJson({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context,
    },
  });
}

async function handlePostToolUse(input: HookInput, eventType: string): Promise<void> {
  const dataDir = ensureDataDir();
  initLogger(dataDir);

  const cwd = input.cwd || process.cwd();
  const project = resolveProjectId(cwd);

  const toolName = input.tool_name || "unknown";
  const toolInputSummary = summarizeHookValue(input.tool_input || {});
  const toolResponse = eventType === "post_tool_use_failure"
    ? input.error ?? input.tool_error ?? ""
    : input.tool_response ?? input.tool_output ?? "";
  const toolResponseSummary = summarizeHookValue(toolResponse, 500);

  log("INFO", eventType, { tool: toolName, sessionId: input.session_id });

  try {
    storeEvent({
      session_id: input.session_id || null,
      project_id: project.projectId,
      event_type: eventType,
      source: toolName,
      body_json: JSON.stringify({
        tool: toolName,
        input_summary: toolInputSummary,
        output_summary: eventType === "post_tool_use" ? toolResponseSummary : "",
        error_summary: eventType === "post_tool_use_failure" ? toolResponseSummary : "",
        cwd,
        branch: project.branch,
      }),
    });
  } catch (e) {
    log("WARN", `Failed to store ${eventType} event`);
  }

  outputJson({});
}

async function handlePostCompact(input: HookInput): Promise<void> {
  const dataDir = ensureDataDir();
  initLogger(dataDir);

  const cwd = input.cwd || process.cwd();
  const project = resolveProjectId(cwd);

  log("INFO", "PostCompact", { sessionId: input.session_id });

  try {
    const content = input.compact_summary || input.compacted_summary || input.summary || "";
    if (content) {
      storeEvent({
        session_id: input.session_id || null,
        project_id: project.projectId,
        event_type: "compact",
        source: "system",
        body_json: JSON.stringify({ summary: truncate(redactText(String(content)), 5000) }),
      });
    }
  } catch (e) {
    log("WARN", "Failed to store compact event");
  }

  outputJson({});
}

function summarizeHookValue(value: unknown, maxLen: number = 300): string {
  const redacted = redactValue(value);
  const text = typeof redacted === "string" ? redacted : JSON.stringify(redacted);
  return truncate(redactText(text), maxLen);
}

function buildTranscriptContext(input: HookInput): Pick<WriterInput, "summary" | "toolEvents" | "transcriptTail"> | null {
  const transcriptPath = typeof input.transcript_path === "string" ? input.transcript_path : "";
  if (!transcriptPath || !existsSync(transcriptPath)) return null;

  try {
    const parsed = parseTranscriptFile(transcriptPath);
    const tail = getTranscriptTail(parsed.entries, 30);
    return {
      summary: parsed.summary,
      toolEvents: parsed.toolEvents
        .map((event) => {
          const inputSummary = summarizeHookValue(event.input, 300);
          const resultSummary = event.result ? summarizeHookValue(event.result, 500) : "";
          return `${event.tool}: ${inputSummary}${resultSummary ? ` => ${resultSummary}` : ""}`;
        })
        .join("\n"),
      transcriptTail: truncate(redactText(JSON.stringify(redactValue(tail), null, 2)), 8000),
    };
  } catch (e) {
    log("WARN", `Failed to parse transcript: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function buildWriterInput(input: HookInput, project: ProjectInfo): WriterInput {
  const projectMemory = readMemory("project", project.projectId, "MEMORY.md");
  const globalMemory = readMemory("global", undefined, "MEMORY.md");
  const checkpoint = readMemory("project", project.projectId, "checkpoint.md");
  const notes = readMemory("project", project.projectId, "notes.md");
  const events = getRecentEvents(project.projectId, 30);
  const transcriptContext = buildTranscriptContext(input);

  return redactValue({
    projectMemory,
    globalMemory,
    checkpoint,
    notes,
    transcriptTail: transcriptContext?.transcriptTail || events.map((e) => `${e.event_type}: ${e.source}`).join("\n"),
    summary: transcriptContext?.summary || `${events.length} events recorded`,
    toolEvents: transcriptContext?.toolEvents || events
      .filter((e) => e.event_type.startsWith("post_tool"))
      .map((e) => {
        try {
          const body = JSON.parse(e.body_json);
          return `${body.tool}: ${body.input_summary || body.error_summary || ""}`;
        } catch {
          return e.source;
        }
      })
      .join("\n"),
    cwd: input.cwd || process.cwd(),
    branch: project.branch,
    projectId: project.projectId,
  });
}

function shouldThrottleWriter(projectId: string, sessionId: string | null, windowMs: number): boolean {
  const recent = getRecentWriterJobs(projectId, sessionId, 10);
  const cutoff = Date.now() - windowMs;
  return recent.some((job) => Date.parse(job.created_at) >= cutoff);
}

function spawnWriterWorker(jobId: string): void {
  const script = process.argv[1];
  if (!script) return;
  const child = spawn(process.execPath, [script, "ProcessWriterJob", jobId], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
}

async function handleWriterTrigger(input: HookInput, eventName: "Stop" | "SessionEnd"): Promise<void> {
  const dataDir = ensureDataDir();
  initLogger(dataDir);

  const cwd = input.cwd || process.cwd();
  const project = resolveProjectId(cwd);
  const config = loadConfig();

  log("INFO", eventName, { sessionId: input.session_id });

  if (!config.writer.enabled || input.stop_hook_active) {
    outputJson({});
    closeDb();
    return;
  }

  try {
    const sessionId = input.session_id || null;
    const throttleMs = eventName === "Stop" ? STOP_THROTTLE_MS : SESSION_END_THROTTLE_MS;
    if (shouldThrottleWriter(project.projectId, sessionId, throttleMs)) {
      log("INFO", "Writer enqueue throttled", { eventName, sessionId });
      outputJson({});
      closeDb();
      return;
    }

    const writerInput = buildWriterInput(input, project);
    const job = createWriterJob({
      session_id: sessionId,
      project_id: project.projectId,
      status: "pending",
      input_json: JSON.stringify(writerInput),
      error: null,
    });

    if (resolveApiKey(config)) {
      spawnWriterWorker(job.id);
    }
    log("INFO", "Writer job queued", { jobId: job.id, eventName });
  } catch (e) {
    log("ERROR", `Writer enqueue failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  closeDb();
  outputJson({});
}

function applyWriterResult(result: WriterOutput, input: WriterInput, sessionId: string | null): void {
  if (result.checkpoint_markdown) {
    writeMemory("project", input.projectId, "checkpoint.md", result.checkpoint_markdown);
  }

  const updatedProjectMemory = applyMemoryPatch(input.projectMemory, result.project_memory_patch);
  if (updatedProjectMemory !== null) {
    writeMemory("project", input.projectId, "MEMORY.md", updatedProjectMemory);
  }

  const updatedGlobalMemory = applyMemoryPatch(input.globalMemory, result.global_memory_patch);
  if (updatedGlobalMemory !== null) {
    writeMemory("global", undefined, "MEMORY.md", updatedGlobalMemory);
  }

  if (result.notes_markdown) {
    writeMemory("project", input.projectId, "notes.md", result.notes_markdown);
  }

  if (result.index_summary) {
    indexDocument({
      scope: "project",
      project_id: input.projectId,
      session_id: sessionId,
      type: "summary",
      path: null,
      title: "Session Summary",
      body: result.index_summary,
      fingerprint: sha256(result.index_summary),
    });
  }
}

async function processWriterJob(jobId: string): Promise<void> {
  const dataDir = ensureDataDir();
  initLogger(dataDir);

  const job = getWriterJob(jobId);
  if (!job) {
    log("WARN", `Writer job not found: ${jobId}`);
    return;
  }
  if (job.status !== "pending") {
    return;
  }

  updateWriterJob(job.id, "running");
  try {
    const writerInput = JSON.parse(job.input_json) as WriterInput;
    const result = await callWriter(writerInput);
    applyWriterResult(result, writerInput, job.session_id);
    updateWriterJob(job.id, "completed");
    log("INFO", "Writer completed", { jobId: job.id, warnings: result.warnings });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    updateWriterJob(job.id, "pending", message);
    log("ERROR", `Writer failed: ${message}`);
  } finally {
    closeDb();
  }
}

export async function runHook(): Promise<void> {
  try {
    const raw = await readStdin();
    const input = parseInput(raw);
    const eventName = input.hook_event_name || process.argv[2] || "";

    if (eventName === "ProcessWriterJob") {
      await processWriterJob(String(process.argv[3] || ""));
      return;
    }

    switch (eventName) {
      case "SessionStart":
        await handleSessionStart(input);
        break;
      case "UserPromptSubmit":
        await handleUserPromptSubmit(input);
        break;
      case "PostToolUse":
        await handlePostToolUse(input, "post_tool_use");
        break;
      case "PostToolUseFailure":
        await handlePostToolUse(input, "post_tool_use_failure");
        break;
      case "PostCompact":
        await handlePostCompact(input);
        break;
      case "Stop":
        await handleWriterTrigger(input, "Stop");
        break;
      case "SessionEnd":
        await handleWriterTrigger(input, "SessionEnd");
        break;
      default:
        log("WARN", `Unknown hook event: ${eventName}`);
        outputJson({});
    }
  } catch (e) {
    log("ERROR", `Hook runner failed: ${e instanceof Error ? e.message : String(e)}`);
    outputJson({});
  }
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith("hook-runner.js") ||
  process.argv[1].endsWith("hook-runner")
);

if (isMain) {
  runHook();
}
