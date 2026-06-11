import { Command } from "commander";
import { resolveProjectId } from "../../storage/project-id.js";
import { readMemory, writeMemory } from "../../storage/memory-files.js";
import { openDb, closeDb, getRecentEvents, indexDocument, createWriterJob, updateWriterJob } from "../../storage/db.js";
import { callWriter, buildWriterPrompt, parseWriterOutput } from "../../writer/index.js";
import { loadConfig, resolveApiKey } from "../../config/index.js";
import { sha256 } from "../../utils/index.js";
import { log, initLogger } from "../../utils/index.js";
import { ensureDataDir } from "../../config/index.js";

export const checkpointCmd = new Command("checkpoint")
  .description("Manage checkpoints");

checkpointCmd
  .command("now")
  .description("Write a checkpoint now")
  .option("--dry-run", "show what would be written without saving")
  .action(async (opts: { dryRun?: boolean }) => {
    const dataDir = ensureDataDir();
    initLogger(dataDir);

    const config = loadConfig();
    const project = resolveProjectId(process.cwd());

    const projectMemory = readMemory("project", project.projectId, "MEMORY.md");
    const globalMemory = readMemory("global", undefined, "MEMORY.md");
    const checkpoint = readMemory("project", project.projectId, "checkpoint.md");
    const notes = readMemory("project", project.projectId, "notes.md");

    let events: ReturnType<typeof getRecentEvents> = [];
    try {
      openDb();
      events = getRecentEvents(project.projectId, 30);
    } catch {
      // proceed without events
    }

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
      cwd: process.cwd(),
      branch: project.branch,
      projectId: project.projectId,
    };

    if (opts.dryRun) {
      console.log("Writer prompt (dry run):\n");
      console.log(buildWriterPrompt(writerInput));
      closeDb();
      return;
    }

    const apiKey = resolveApiKey(config);
    if (!apiKey) {
      console.error(`Error: Writer API key not found. Set ${config.writer.apiKeyEnv} environment variable.`);
      console.error("Run 'cmh config set writer.apiKeyEnv YOUR_ENV_VAR' to configure.");
      closeDb();
      process.exit(1);
    }

    console.log("Calling writer model...");

    try {
      const result = await callWriter(writerInput);

      console.log("\n--- Checkpoint ---");
      console.log(result.checkpoint_markdown || "(empty)");

      if (result.project_memory_patch.mode !== "none") {
        console.log("\n--- Project Memory Patch ---");
        console.log(result.project_memory_patch.markdown || "(empty)");
      }

      if (result.global_memory_patch.mode !== "none") {
        console.log("\n--- Global Memory Patch ---");
        console.log(result.global_memory_patch.markdown || "(empty)");
      }

      if (result.warnings.length > 0) {
        console.log("\n--- Warnings ---");
        for (const w of result.warnings) {
          console.log(`  - ${w}`);
        }
      }

      if (result.checkpoint_markdown) {
        writeMemory("project", project.projectId, "checkpoint.md", result.checkpoint_markdown);
        console.log("\nCheckpoint saved.");
      }
      if (result.project_memory_patch.mode !== "none" && result.project_memory_patch.markdown) {
        writeMemory("project", project.projectId, "MEMORY.md", result.project_memory_patch.markdown);
        console.log("Project memory updated.");
      }
      if (result.global_memory_patch.mode !== "none" && result.global_memory_patch.markdown) {
        writeMemory("global", undefined, "MEMORY.md", result.global_memory_patch.markdown);
        console.log("Global memory updated.");
      }
      if (result.notes_markdown) {
        writeMemory("project", project.projectId, "notes.md", result.notes_markdown);
        console.log("Notes updated.");
      }

      if (result.index_summary) {
        try {
          indexDocument({
            scope: "project",
            project_id: project.projectId,
            session_id: null,
            type: "summary",
            path: null,
            title: "Checkpoint Summary",
            body: result.index_summary,
            fingerprint: sha256(result.index_summary),
          });
        } catch {
          // non-fatal
        }
      }
    } catch (e) {
      console.error(`Writer failed: ${e instanceof Error ? e.message : String(e)}`);
      console.error("The checkpoint job has been queued for retry.");

      try {
        createWriterJob({
          session_id: null,
          project_id: project.projectId,
          status: "pending",
          input_json: JSON.stringify(writerInput),
          error: e instanceof Error ? e.message : String(e),
        });
      } catch {
        // non-fatal
      }
    }

    closeDb();
  });

checkpointCmd
  .command("show")
  .description("Show the current checkpoint")
  .action(() => {
    const project = resolveProjectId(process.cwd());
    const checkpoint = readMemory("project", project.projectId, "checkpoint.md");
    if (checkpoint) {
      console.log(checkpoint);
    } else {
      console.log("No checkpoint found.");
    }
  });
