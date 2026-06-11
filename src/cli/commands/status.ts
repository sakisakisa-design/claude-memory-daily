import { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, loadConfig, resolveApiKey } from "../../config/index.js";
import { resolveProjectId } from "../../storage/project-id.js";
import { readMemory } from "../../storage/memory-files.js";
import { openDb, closeDb, getRecentEvents, getPendingWriterJobs } from "../../storage/db.js";

export const statusCmd = new Command("status")
  .description("Show Claude Memory Harness status")
  .action(async () => {
    const config = loadConfig();
    const dataDir = getDataDir();
    const project = resolveProjectId(process.cwd());

    console.log("Claude Memory Harness Status\n");

    console.log(`  Enabled:      ${config.enabled}`);
    console.log(`  Data dir:     ${dataDir}`);
    console.log(`  Config:       ${existsSync(join(dataDir, "config.json")) ? "found" : "missing"}`);
    console.log(`  Writer:       ${config.writer.enabled ? `${config.writer.baseURL} / ${config.writer.model}` : "disabled"}`);
    console.log(`  API key:      ${resolveApiKey(config) ? "configured" : "not set"}`);
    console.log(`  Redaction:    ${config.redaction.enabled ? "enabled" : "disabled"}`);
    console.log("");

    console.log(`  Project:      ${project.alias}`);
    console.log(`  Project ID:   ${project.projectId}`);
    console.log(`  Branch:       ${project.branch || "none"}`);
    console.log(`  Repo root:    ${project.repoRoot || "not a git repo"}`);
    console.log("");

    const globalMemory = readMemory("global", undefined, "MEMORY.md");
    const projectMemory = readMemory("project", project.projectId, "MEMORY.md");
    const checkpoint = readMemory("project", project.projectId, "checkpoint.md");

    console.log(`  Global memory:    ${globalMemory ? `${globalMemory.length} chars` : "empty"}`);
    console.log(`  Project memory:   ${projectMemory ? `${projectMemory.length} chars` : "empty"}`);
    console.log(`  Checkpoint:       ${checkpoint ? `${checkpoint.length} chars` : "empty"}`);

    try {
      openDb();
      const events = getRecentEvents(project.projectId, 10);
      const jobs = getPendingWriterJobs();
      console.log(`  Recent events:    ${events.length}`);
      console.log(`  Pending jobs:     ${jobs.length}`);
      closeDb();
    } catch {
      console.log(`  Database:         unavailable`);
    }
  });
