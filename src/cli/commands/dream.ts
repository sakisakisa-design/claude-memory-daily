import { Command } from "commander";
import { resolveProjectId } from "../../storage/project-id.js";
import { readMemory, writeMemory } from "../../storage/memory-files.js";
import { callWriter, buildWriterPrompt } from "../../writer/index.js";
import { loadConfig, resolveApiKey } from "../../config/index.js";
import { ensureDataDir } from "../../config/index.js";
import { initLogger } from "../../utils/index.js";

export const dreamCmd = new Command("dream")
  .description("Consolidate and clean up memory (dream mode)")
  .option("--dry-run", "show proposed changes without applying")
  .option("--apply", "apply proposed changes")
  .action(async (opts: { dryRun?: boolean; apply?: boolean }) => {
    const dataDir = ensureDataDir();
    initLogger(dataDir);

    const config = loadConfig();
    const project = resolveProjectId(process.cwd());

    const projectMemory = readMemory("project", project.projectId, "MEMORY.md");
    const globalMemory = readMemory("global", undefined, "MEMORY.md");
    const notes = readMemory("project", project.projectId, "notes.md");

    const dreamPrompt = `You are performing a "dream" memory consolidation. Review the following memories and:
1. Remove duplicate or contradictory entries
2. Consolidate repeated findings into stable notes
3. Clean up stale information
4. Keep only durable, useful knowledge

Current memories to consolidate:

## Project Memory
${projectMemory || "(empty)"}

## Global Memory
${globalMemory || "(empty)"}

## Notes
${notes || "(empty)"}

Provide consolidated versions of each section. Only include sections that have meaningful content.
Respond with JSON:
{
  "project_memory": "consolidated project memory markdown or empty string",
  "global_memory": "consolidated global memory markdown or empty string",
  "notes": "consolidated notes markdown or empty string",
  "changes_summary": "description of what was changed"
}`;

    const writerInput = {
      projectMemory,
      globalMemory,
      checkpoint: "",
      notes,
      transcriptTail: "",
      summary: "Dream consolidation request",
      toolEvents: "",
      cwd: process.cwd(),
      branch: project.branch,
      projectId: project.projectId,
    };

    const apiKey = resolveApiKey(config);
    if (!apiKey) {
      console.error(`Error: Writer API key not found. Set ${config.writer.apiKeyEnv} environment variable.`);
      process.exit(1);
    }

    if (opts.dryRun) {
      console.log("Dream mode: would send consolidation request to writer model.");
      console.log("Current memories:");
      console.log(`  Project memory: ${projectMemory.length} chars`);
      console.log(`  Global memory:  ${globalMemory.length} chars`);
      console.log(`  Notes:          ${notes.length} chars`);
      return;
    }

    console.log("Running dream consolidation...");

    try {
      const result = await callWriter(writerInput);

      console.log("\n--- Dream Results ---");
      console.log(`Index summary: ${result.index_summary || "none"}`);

      if (result.project_memory_patch.markdown) {
        console.log("\n--- Proposed Project Memory ---");
        console.log(result.project_memory_patch.markdown);
      }
      if (result.global_memory_patch.markdown) {
        console.log("\n--- Proposed Global Memory ---");
        console.log(result.global_memory_patch.markdown);
      }

      if (opts.apply) {
        if (result.project_memory_patch.markdown) {
          writeMemory("project", project.projectId, "MEMORY.md", result.project_memory_patch.markdown);
          console.log("\nProject memory updated.");
        }
        if (result.global_memory_patch.markdown) {
          writeMemory("global", undefined, "MEMORY.md", result.global_memory_patch.markdown);
          console.log("Global memory updated.");
        }
        if (result.notes_markdown) {
          writeMemory("project", project.projectId, "notes.md", result.notes_markdown);
          console.log("Notes updated.");
        }
      } else {
        console.log("\nUse --apply to save these changes.");
      }

      if (result.warnings.length > 0) {
        console.log("\nWarnings:");
        for (const w of result.warnings) {
          console.log(`  - ${w}`);
        }
      }
    } catch (e) {
      console.error(`Dream failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  });
