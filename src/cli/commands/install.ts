import { Command } from "commander";
import { existsSync, mkdirSync, symlinkSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { ensureDataDir, saveConfig, loadConfig } from "../../config/index.js";

export const installCmd = new Command("install")
  .description("Install Claude Memory Harness as a Claude Code plugin")
  .action(async () => {
    console.log("Installing Claude Memory Harness...");

    const dataDir = ensureDataDir();
    console.log(`  Data directory: ${dataDir}`);

    const configPath = join(dataDir, "config.json");
    if (!existsSync(configPath)) {
      const defaultConfig = loadConfig();
      saveConfig(defaultConfig);
      console.log(`  Created default config: ${configPath}`);
    } else {
      console.log(`  Config already exists: ${configPath}`);
    }

    const claudeDir = join(homedir(), ".claude");
    const pluginDir = join(claudeDir, "plugins", "claude-memory-harness");
    const packageRoot = resolvePackageRoot(import.meta.url);

    mkdirSync(join(claudeDir, "plugins"), { recursive: true });

    if (!existsSync(pluginDir)) {
      try {
        symlinkSync(packageRoot, pluginDir, "dir");
        console.log(`  Symlinked plugin: ${pluginDir} -> ${packageRoot}`);
      } catch {
        console.log(`  Could not symlink. Copying plugin files instead.`);
        cpSync(packageRoot, pluginDir, { recursive: true });
        console.log(`  Copied plugin to: ${pluginDir}`);
      }
    } else {
      console.log(`  Plugin already installed at: ${pluginDir}`);
    }

    console.log("");
    console.log("Installation complete! Next steps:");
    console.log("");
    console.log("  1. Configure the writer model:");
    console.log("     cmh config set writer.baseURL https://api.openai.com/v1");
    console.log("     cmh config set writer.apiKeyEnv OPENAI_API_KEY");
    console.log("     cmh config set writer.model gpt-4o-mini");
    console.log("");
    console.log("  2. Restart Claude Code or run /reload-plugins");
    console.log("");
    console.log("  3. Check status:");
    console.log("     cmh doctor");
    console.log("     cmh status");
    console.log("");
    console.log("  For development, use:");
    console.log("     claude --plugin-dir ./");
  });

export function resolvePackageRoot(moduleUrl: string): string {
  let current = dirname(fileURLToPath(moduleUrl));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(current, "package.json")) && existsSync(join(current, "hooks"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return join(dirname(fileURLToPath(moduleUrl)), "..", "..");
}
