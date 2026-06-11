import { Command } from "commander";
import { resolveProjectId } from "../../storage/project-id.js";
import { readMemory, writeMemory } from "../../storage/memory-files.js";

export const forgetCmd = new Command("forget")
  .description("Forget specific memories");

forgetCmd
  .command("project")
  .description("Clear all project memory for current project")
  .option("--confirm", "actually delete (required)")
  .action((opts: { confirm?: boolean }) => {
    const project = resolveProjectId(process.cwd());

    if (!opts.confirm) {
      console.log(`This will clear all memory for project: ${project.alias} (${project.projectId})`);
      console.log("Use --confirm to proceed.");
      return;
    }

    writeMemory("project", project.projectId, "MEMORY.md", "");
    writeMemory("project", project.projectId, "checkpoint.md", "");
    writeMemory("project", project.projectId, "notes.md", "");
    console.log(`Cleared all memory for project: ${project.alias}`);
  });

forgetCmd
  .command("global")
  .description("Clear all global memory")
  .option("--confirm", "actually delete (required)")
  .action((opts: { confirm?: boolean }) => {
    if (!opts.confirm) {
      console.log("This will clear all global memory.");
      console.log("Use --confirm to proceed.");
      return;
    }

    writeMemory("global", undefined, "MEMORY.md", "");
    console.log("Cleared all global memory.");
  });

forgetCmd
  .command("checkpoint")
  .description("Clear the current project checkpoint")
  .option("--confirm", "actually delete (required)")
  .action((opts: { confirm?: boolean }) => {
    const project = resolveProjectId(process.cwd());

    if (!opts.confirm) {
      console.log(`This will clear the checkpoint for project: ${project.alias}`);
      console.log("Use --confirm to proceed.");
      return;
    }

    writeMemory("project", project.projectId, "checkpoint.md", "");
    console.log(`Cleared checkpoint for project: ${project.alias}`);
  });
