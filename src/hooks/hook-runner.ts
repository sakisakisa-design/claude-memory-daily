import { readFileSync } from "node:fs";
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
  buildWriterPrompt,
  getRecentEvents,
  indexDocument,
  sha256,
  redactSecrets,
  truncate,
  closeDb,
} from "../index.js";

interface HookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  tool_error?: string;
  user_prompt?: string;
  transcript_path?: string;
  [key: string]: unknown;
}

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
  const prompt = input.user_prompt || "";

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
  const toolInput = input.tool_input || {};
  const toolOutput = input.tool_output ? truncate(redactSecrets(String(input.tool_output)), 500) : "";
  const toolError = input.tool_error ? truncate(redactSecrets(String(input.tool_error)), 500) : "";

  log("INFO", eventType, { tool: toolName, sessionId: input.session_id });

  try {
    storeEvent({
      session_id: input.session_id || null,
      project_id: project.projectId,
      event_type: eventType,
      source: toolName,
      body_json: JSON.stringify({
        tool: toolName,
        input_summary: truncate(JSON.stringify(toolInput), 300),
        output_summary: toolOutput,
        error_summary: toolError,
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
    const content = input.compacted_summary || input.summary || "";
    if (content) {
      storeEvent({
        session_id: input.session_id || null,
        project_id: project.projectId,
        event_type: "compact",
        source: "system",
        body_json: JSON.stringify({ summary: truncate(redactSecrets(String(content)), 5000) }),
      });
    }
  } catch (e) {
    log("WARN", "Failed to store compact event");
  }

  outputJson({});
}

async function handleStop(input: HookInput): Promise<void> {
  const dataDir = ensureDataDir();
  initLogger(dataDir);

  const cwd = input.cwd || process.cwd();
  const project = resolveProjectId(cwd);
  const config = loadConfig();

  log("INFO", "Stop/SessionEnd", { sessionId: input.session_id });

  if (!config.writer.enabled) {
    outputJson({});
    closeDb();
    return;
  }

  try {
    const projectMemory = readMemory("project", project.projectId, "MEMORY.md");
    const globalMemory = readMemory("global", undefined, "MEMORY.md");
    const checkpoint = readMemory("project", project.projectId, "checkpoint.md");
    const notes = readMemory("project", project.projectId, "notes.md");
    const events = getRecentEvents(project.projectId, 30);

    const writerInput = {
      projectMemory,
      globalMemory,
      checkpoint,
      notes,
      transcriptTail: events.map((e) => `${e.event_type}: ${e.source}`).join("\n"),
      summary: `${events.length} events recorded`,
      toolEvents: events
        .filter((e) => e.event_type.startsWith("post_tool"))
        .map((e) => {
          try {
            const body = JSON.parse(e.body_json);
            return `${body.tool}: ${body.input_summary || ""}`;
          } catch {
            return e.source;
          }
        })
        .join("\n"),
      cwd,
      branch: project.branch,
      projectId: project.projectId,
    };

    const result = await callWriter(writerInput);

    if (result.checkpoint_markdown) {
      writeMemory("project", project.projectId, "checkpoint.md", result.checkpoint_markdown);
    }
    if (result.project_memory_patch.mode !== "none" && result.project_memory_patch.markdown) {
      writeMemory("project", project.projectId, "MEMORY.md", result.project_memory_patch.markdown);
    }
    if (result.global_memory_patch.mode !== "none" && result.global_memory_patch.markdown) {
      writeMemory("global", undefined, "MEMORY.md", result.global_memory_patch.markdown);
    }
    if (result.notes_markdown) {
      writeMemory("project", project.projectId, "notes.md", result.notes_markdown);
    }
    if (result.index_summary) {
      indexDocument({
        scope: "project",
        project_id: project.projectId,
        session_id: input.session_id || null,
        type: "summary",
        path: null,
        title: "Session Summary",
        body: result.index_summary,
        fingerprint: sha256(result.index_summary),
      });
    }

    log("INFO", "Writer completed", { warnings: result.warnings });
  } catch (e) {
    log("ERROR", `Writer failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  closeDb();
  outputJson({});
}

export async function runHook(): Promise<void> {
  try {
    const raw = await readStdin();
    const input = parseInput(raw);
    const eventName = input.hook_event_name || process.argv[2] || "";

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
      case "SessionEnd":
        await handleStop(input);
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
