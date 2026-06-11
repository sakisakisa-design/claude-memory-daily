import { loadConfig, resolveApiKey } from "../config/index.js";
import type { CMHConfig, WriterConfig } from "../config/index.js";
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
    mode: "none" | "replace-section-or-append";
    markdown: string;
  };
  global_memory_patch: {
    mode: "none" | "replace-section-or-append";
    markdown: string;
  };
  notes_markdown: string;
  index_summary: string;
  warnings: string[];
}

const WRITER_SYSTEM_PROMPT = `You are a checkpoint and memory writer for a coding assistant. Your job is to:
1. Write a structured checkpoint summarizing the current session state, task progress, and next steps.
2. Suggest patches to project memory for durable facts (architecture decisions, gotchas, commands).
3. Suggest patches to global memory only for broadly useful, stable information.
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

Respond ONLY with a valid JSON object matching this schema:
{
  "checkpoint_markdown": "...",
  "project_memory_patch": { "mode": "none" | "replace-section-or-append", "markdown": "..." },
  "global_memory_patch": { "mode": "none" | "replace-section-or-append", "markdown": "..." },
  "notes_markdown": "...",
  "index_summary": "...",
  "warnings": []
}`;

export function buildWriterPrompt(input: WriterInput): string {
  const parts: string[] = [
    `## Session Context`,
    `- Project: ${input.projectId}`,
    `- CWD: ${input.cwd}`,
    `- Branch: ${input.branch || "unknown"}`,
    "",
    `## Current Project Memory`,
    input.projectMemory || "(empty)",
    "",
    `## Current Global Memory`,
    input.globalMemory || "(empty)",
    "",
    `## Current Checkpoint`,
    input.checkpoint || "(empty)",
    "",
    `## Notes`,
    input.notes || "(empty)",
    "",
    `## Session Summary`,
    input.summary || "(no summary)",
    "",
    `## Recent Tool Events`,
    input.toolEvents || "(none)",
  ];

  if (input.userPrompt) {
    parts.push("", `## Latest User Prompt`, input.userPrompt);
  }

  if (input.transcriptTail) {
    parts.push("", `## Transcript Tail`, input.transcriptTail);
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

  return {
    checkpoint_markdown: parsed.checkpoint_markdown || "",
    project_memory_patch: parsed.project_memory_patch || { mode: "none", markdown: "" },
    global_memory_patch: parsed.global_memory_patch || { mode: "none", markdown: "" },
    notes_markdown: parsed.notes_markdown || "",
    index_summary: parsed.index_summary || "",
    warnings: parsed.warnings || [],
  };
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
