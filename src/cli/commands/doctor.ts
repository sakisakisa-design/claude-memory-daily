import { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, loadConfig, resolveApiKey } from "../../config/index.js";
import { resolveProjectId } from "../../storage/project-id.js";
import { openDb, closeDb } from "../../storage/db.js";

export const doctorCmd = new Command("doctor")
  .description("Check Claude Memory Harness installation and configuration")
  .action(async () => {
    const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

    const dataDir = getDataDir();
    const dataDirExists = existsSync(dataDir);
    checks.push({
      name: "Data directory",
      ok: dataDirExists,
      detail: dataDirExists ? dataDir : `${dataDir} (missing - run 'cmh install')`,
    });

    const configPath = join(dataDir, "config.json");
    const configExists = existsSync(configPath);
    checks.push({
      name: "Config file",
      ok: configExists,
      detail: configExists ? configPath : `${configPath} (missing)`,
    });

    if (configExists) {
      const config = loadConfig();
      checks.push({
        name: "Plugin enabled",
        ok: config.enabled,
        detail: config.enabled ? "yes" : "no (set enabled: true)",
      });

      checks.push({
        name: "Writer configured",
        ok: config.writer.enabled && !!config.writer.baseURL && !!config.writer.model,
        detail: config.writer.enabled
          ? `${config.writer.baseURL} / ${config.writer.model}`
          : "writer disabled",
      });

      const apiKey = resolveApiKey(config);
      checks.push({
        name: "API key available",
        ok: !!apiKey,
        detail: apiKey
          ? `${config.writer.apiKeyEnv} is set`
          : `${config.writer.apiKeyEnv} is not set`,
      });
    }

    let dbOk = false;
    try {
      openDb();
      dbOk = true;
      checks.push({
        name: "Data store",
        ok: true,
        detail: "JSON store connected (plain text search)",
      });
    } catch (e) {
      checks.push({
        name: "Data store",
        ok: false,
        detail: `failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    const project = resolveProjectId(process.cwd());
    checks.push({
      name: "Project detection",
      ok: true,
      detail: `id=${project.projectId} alias=${project.alias} branch=${project.branch || "none"}`,
    });

    if (dbOk) closeDb();

    console.log("Claude Memory Harness Doctor\n");
    let allOk = true;
    for (const check of checks) {
      const icon = check.ok ? "[OK]" : "[!!]";
      console.log(`  ${icon} ${check.name}: ${check.detail}`);
      if (!check.ok) allOk = false;
    }

    console.log("");
    if (allOk) {
      console.log("All checks passed.");
    } else {
      console.log("Some checks failed. Run 'cmh install' to set up missing components.");
    }

    process.exit(allOk ? 0 : 1);
  });
