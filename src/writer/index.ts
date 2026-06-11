import { loadConfig, resolveApiKey } from "../config/index.js";
import type { CMHConfig, WriterConfig } from "../config/index.js";
import { redactValue } from "../redaction/index.js";
import { log } from "../utils/index.js";

export interface WriterInput {
  projectMemory: string;
  globalMemory: string;
  checkpoint: string;
  notes: string;
  transcriptTail: string;
  summary: string;
  toolEvents: string;
  cwd: string;
  branch: string | null;
  projectId: string;
  userPrompt?: string;
}

export interface WriterOutput {
  checkpoint_markdown: string;
  project_memory_patch: {
    mode: "none" | "replace-full";
    markdown: string;
  };
  global_memory_patch: {
    mode: "none" | "replace-full";
    markdown: string;
  };
  notes_markdown: string;
  index_summary: string;
  warnings: string[];
}

const WRITER_SYSTEM_PROMPT = `You are a checkpoint and memory writer for a coding assistant. Your job is to:
1. Write a structured checkpoint summarizing the current session state, task progress, and next steps.
2. Suggest full replacements for project memory when durable facts should change.
3. Suggest full replacements for global memory only for broadly useful, stable information.
4. Clean up notes if needed.

Rules:
- Preserve exact user-stated constraints when important.
- Prefer durable project facts over vibes.
- Do not convert one-time instructions into permanent memory.
- Do not store secrets or private credentials.
- Distinguish project memory from session checkpoint.
- Keep checkpoint focused on current task state and next action.
- Keep project memory focused on stable architecture, decisions, gotchas, commands.
- Keep global memory minimal and opt-in.
- For project_memory_patch and global_memory_patch, use mode "replace-full" only when markdown contains the complete desired replacement for the entire target MEMORY.md file. Never return partial patches, snippets, or section-only content.

Respond ONLY with a valid JSON object matching this schema:
{
  "checkpoint_markdown": "...",
  "project_memory_patch": { "mode": "none" | "replace-full", "markdown": "..." },
  "global_memory_patch": { "mode": "none" | "replace-full", "markdown": "..." },
  "notes_markdown": "...",
  "index_summary": "...",
  "warnings": []
}`;

export function buildWriterPrompt(input: WriterInput): string {
  const redacted = redactValue(input);
  const parts: string[] = [
    `## Session Context`,
    `- Project: ${redacted.projectId}`,
    `- CWD: ${redacted.cwd}`,
    `- Branch: ${redacted.branch || "unknown"}`,
    "",
    `## Current Project Memory`,
    redacted.projectMemory || "(empty)",
    "",
    `## Current Global Memory`,
    redacted.globalMemory || "(empty)",
    "",
    `## Current Checkpoint`,
    redacted.checkpoint || "(empty)",
    "",
    `## Notes`,
    redacted.notes || "(empty)",
    "",
    `## Session Summary`,
    redacted.summary || "(no summary)",
    "",
    `## Recent Tool Events`,
    redacted.toolEvents || "(none)",
  ];

  if (redacted.userPrompt) {
    parts.push("", `## Latest User Prompt`, redacted.userPrompt);
  }

  if (redacted.transcriptTail) {
    parts.push("", `## Transcript Tail`, redacted.transcriptTail);
  }

  parts.push("", "Please write an updated checkpoint and any memory patches needed.");

  return parts.join("\n");
}

export async function callWriter(input: WriterInput): Promise<WriterOutput> {
  const config = loadConfig();
  const apiKey = resolveApiKey(config);

  if (!apiKey) {
    throw new Error(`Writer API key not found. Set ${config.writer.apiKeyEnv} or configure writer.apiKey.`);
  }

  const prompt = buildWriterPrompt(input);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.writer.timeoutMs);

  try {
    const response = await fetch(`${config.writer.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.writer.model,
        temperature: config.writer.temperature,
        max_tokens: config.writer.maxTokens,
        messages: [
          { role: "system", content: WRITER_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Writer API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Writer returned empty response");
    }

    return parseWriterOutput(content);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseWriterOutput(raw: string): WriterOutput {
  let content = raw.trim();

  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    content = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(content);

  const projectPatch = normalizeMemoryPatch(parsed.project_memory_patch);
  const globalPatch = normalizeMemoryPatch(parsed.global_memory_patch);

  return {
    checkpoint_markdown: parsed.checkpoint_markdown || "",
    project_memory_patch: projectPatch,
    global_memory_patch: globalPatch,
    notes_markdown: parsed.notes_markdown || "",
    index_summary: parsed.index_summary || "",
    warnings: parsed.warnings || [],
  };
}

function normalizeMemoryPatch(patch: unknown): WriterOutput["project_memory_patch"] {
  if (!patch || typeof patch !== "object") {
    return { mode: "none", markdown: "" };
  }
  const candidate = patch as { mode?: unknown; markdown?: unknown };
  if (candidate.mode === "replace-full") {
    return {
      mode: "replace-full",
      markdown: typeof candidate.markdown === "string" ? candidate.markdown : "",
    };
  }
  return { mode: "none", markdown: "" };
}

export function applyMemoryPatch(current: string, patch: WriterOutput["project_memory_patch"]): string | null {
  if (patch.mode === "none") return null;
  if (patch.mode === "replace-full" && patch.markdown.trim()) {
    return patch.markdown;
  }
  return null;
}

export function createMockWriterOutput(overrides?: Partial<WriterOutput>): WriterOutput {
  return {
    checkpoint_markdown: "# Checkpoint\n\nSession completed.",
    project_memory_patch: { mode: "none", markdown: "" },
    global_memory_patch: { mode: "none", markdown: "" },
    notes_markdown: "",
    index_summary: "Mock writer output",
    warnings: [],
    ...overrides,
  };
}
