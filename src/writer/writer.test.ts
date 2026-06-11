import { describe, it, expect } from "vitest";
import { parseWriterOutput, buildWriterPrompt, createMockWriterOutput, applyMemoryPatch } from "./index.js";
import type { WriterInput } from "./index.js";

describe("writer", () => {
  it("builds writer prompt with all sections", () => {
    const input: WriterInput = {
      projectMemory: "# Project\nAuth module uses JWT",
      globalMemory: "# Global\nPrefer TypeScript",
      checkpoint: "# Checkpoint\nWorking on login bug",
      notes: "# Notes\nRemember to add tests",
      transcriptTail: "Write: src/auth.ts\nBash: npm test",
      summary: "5 events recorded",
      toolEvents: "Write: src/auth.ts\nBash: npm test",
      cwd: "/home/user/project",
      branch: "feature/login",
      projectId: "proj-123",
      userPrompt: "Fix the login bug",
    };

    const prompt = buildWriterPrompt(input);
    expect(prompt).toContain("JWT");
    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("login bug");
    expect(prompt).toContain("feature/login");
    expect(prompt).toContain("proj-123");
  });

  it("parses valid JSON writer output", () => {
    const raw = JSON.stringify({
      checkpoint_markdown: "# Checkpoint\nTask completed.",
      project_memory_patch: { mode: "replace-full", markdown: "# Project Memory\nNew fact" },
      global_memory_patch: { mode: "none", markdown: "" },
      notes_markdown: "",
      index_summary: "Completed login fix",
      warnings: [],
    });

    const result = parseWriterOutput(raw);
    expect(result.checkpoint_markdown).toContain("Task completed");
    expect(result.project_memory_patch.mode).toBe("replace-full");
    expect(result.global_memory_patch.mode).toBe("none");
    expect(result.warnings).toEqual([]);
  });

  it("does not accept legacy partial memory patch modes", () => {
    const raw = JSON.stringify({
      checkpoint_markdown: "# Checkpoint",
      project_memory_patch: { mode: "replace-section-or-append", markdown: "partial snippet" },
      global_memory_patch: { mode: "none", markdown: "" },
    });

    const result = parseWriterOutput(raw);
    expect(result.project_memory_patch.mode).toBe("none");
    expect(result.project_memory_patch.markdown).toBe("");
  });

  it("parses JSON wrapped in code blocks", () => {
    const raw = '```json\n{"checkpoint_markdown":"test","project_memory_patch":{"mode":"none","markdown":""},"global_memory_patch":{"mode":"none","markdown":""},"notes_markdown":"","index_summary":"ok","warnings":[]}\n```';

    const result = parseWriterOutput(raw);
    expect(result.checkpoint_markdown).toBe("test");
  });

  it("handles missing fields gracefully", () => {
    const raw = JSON.stringify({ checkpoint_markdown: "only checkpoint" });
    const result = parseWriterOutput(raw);
    expect(result.checkpoint_markdown).toBe("only checkpoint");
    expect(result.project_memory_patch.mode).toBe("none");
    expect(result.warnings).toEqual([]);
  });

  it("creates mock writer output", () => {
    const mock = createMockWriterOutput();
    expect(mock.checkpoint_markdown).toContain("Checkpoint");
    expect(mock.warnings).toEqual([]);

    const custom = createMockWriterOutput({ checkpoint_markdown: "custom" });
    expect(custom.checkpoint_markdown).toBe("custom");
  });

  it("applies only full memory replacements", () => {
    expect(applyMemoryPatch("old", { mode: "none", markdown: "" })).toBeNull();
    expect(applyMemoryPatch("old", { mode: "replace-full", markdown: "" })).toBeNull();
    expect(applyMemoryPatch("old", { mode: "replace-full", markdown: "# New Memory" })).toBe("# New Memory");
  });
});
