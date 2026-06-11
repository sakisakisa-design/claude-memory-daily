import { Command } from "commander";
import { ensureDataDir } from "../../config/index.js";
import { writeHandoff } from "../../handoff/index.js";
import { readMemory } from "../../storage/memory-files.js";
import { resolveProjectId } from "../../storage/project-id.js";
import { initLogger } from "../../utils/index.js";

export const handoffCmd = new Command("handoff")
  .description("Generate or show a compact handoff for the current project")
  .option("--show", "show the current handoff without regenerating")
  .option("--transcript <path>", "include a Claude Code transcript tail")
  .action((opts: { show?: boolean; transcript?: string }) => {
    const dataDir = ensureDataDir();
    initLogger(dataDir);
    const project = resolveProjectId(process.cwd());

    if (opts.show) {
      const existing = readMemory("project", project.projectId, "handoff.md");
      console.log(existing || "No handoff found.");
      return;
    }

    const markdown = writeHandoff({
      projectId: project.projectId,
      cwd: process.cwd(),
      branch: project.branch,
      transcriptPath: opts.transcript,
    });
    console.log(markdown);
  });
