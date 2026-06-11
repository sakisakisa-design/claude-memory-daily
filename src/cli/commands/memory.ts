import { Command } from "commander";
import { resolveProjectId } from "../../storage/project-id.js";
import { searchMemory } from "../../search/index.js";
import { readMemory, listMemoryFiles } from "../../storage/memory-files.js";
import { openDb, closeDb, indexDocument } from "../../storage/db.js";
import { sha256 } from "../../utils/index.js";

export const memoryCmd = new Command("memory")
  .description("Manage memory files");

memoryCmd
  .command("search <query>")
  .description("Search memory for relevant content")
  .option("-n, --limit <number>", "max results", "10")
  .action((query: string, opts: { limit: string }) => {
    try {
      openDb();
    } catch {
      // search can work without DB
    }

    const project = resolveProjectId(process.cwd());
    const results = searchMemory(query, project.projectId, parseInt(opts.limit));

    if (results.length === 0) {
      console.log("No relevant memories found.");
      closeDb();
      return;
    }

    console.log(`Found ${results.length} result(s):\n`);
    for (const r of results) {
      console.log(`  [${r.scope}/${r.type}] ${r.title} (score: ${r.score.toFixed(2)})`);
      const preview = r.body.length > 200 ? r.body.slice(0, 200) + "..." : r.body;
      console.log(`    ${preview}\n`);
    }

    closeDb();
  });

memoryCmd
  .command("open [scope]")
  .description("Show memory file contents (scope: global, project)")
  .action((scope?: string) => {
    const project = resolveProjectId(process.cwd());

    if (scope === "global" || !scope) {
      const content = readMemory("global", undefined, "MEMORY.md");
      if (content) {
        console.log("=== Global Memory ===\n");
        console.log(content);
      }
    }

    if (scope === "project" || !scope) {
      const content = readMemory("project", project.projectId, "MEMORY.md");
      if (content) {
        console.log("=== Project Memory ===\n");
        console.log(content);
      }
    }

    if (!content(scope, project)) {
      console.log("No memory files found. Memory will be created during sessions.");
    }
  });

memoryCmd
  .command("list")
  .description("List all memory files")
  .action(() => {
    const project = resolveProjectId(process.cwd());
    const files = listMemoryFiles(project.projectId);

    if (files.length === 0) {
      console.log("No memory files found.");
      return;
    }

    for (const f of files) {
      console.log(`  [${f.scope}] ${f.name} -> ${f.path}`);
    }
  });

memoryCmd
  .command("reindex")
  .description("Reindex all memory files into the search database")
  .action(() => {
    openDb();
    const project = resolveProjectId(process.cwd());
    const files = listMemoryFiles(project.projectId);
    let count = 0;

    for (const f of files) {
      const content = readMemory(f.scope, f.projectId, f.name);
      if (content) {
        indexDocument({
          scope: f.scope,
          project_id: f.projectId || null,
          session_id: null,
          type: "memory-file",
          path: f.path,
          title: f.name,
          body: content,
          fingerprint: sha256(content),
        });
        count++;
      }
    }

    closeDb();
    console.log(`Indexed ${count} memory file(s).`);
  });

function content(scope: string | undefined, project: { projectId: string }): boolean {
  if (scope === "global") return !!readMemory("global", undefined, "MEMORY.md");
  if (scope === "project") return !!readMemory("project", project.projectId, "MEMORY.md");
  return !!readMemory("global", undefined, "MEMORY.md") || !!readMemory("project", project.projectId, "MEMORY.md");
}
