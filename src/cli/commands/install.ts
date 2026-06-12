import { Command } from "commander";
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { ensureDataDir, saveConfig, loadConfig } from "../../config/index.js";

const PLUGIN_NAME = "claude-memory-harness";
const MARKETPLACE_NAME = "local-memory-harness";

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
    const packageRoot = resolvePackageRoot(import.meta.url);

    const legacyPluginDir = installLegacyPluginLink(claudeDir, packageRoot);
    const marketplaceDir = installLocalMarketplace(claudeDir, packageRoot);
    registerWithClaudeCli(marketplaceDir);

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
    console.log("  Installed paths:");
    console.log(`     Marketplace: ${marketplaceDir}`);
    console.log(`     Legacy link: ${legacyPluginDir}`);
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

function installLegacyPluginLink(claudeDir: string, packageRoot: string): string {
  const pluginDir = join(claudeDir, "plugins", PLUGIN_NAME);

  mkdirSync(join(claudeDir, "plugins"), { recursive: true });

  if (!existsSync(pluginDir)) {
    try {
      symlinkSync(packageRoot, pluginDir, "dir");
      console.log(`  Symlinked legacy plugin path: ${pluginDir} -> ${packageRoot}`);
    } catch {
      console.log("  Could not symlink legacy plugin path. Copying plugin files instead.");
      cpSync(packageRoot, pluginDir, { recursive: true });
      console.log(`  Copied legacy plugin path: ${pluginDir}`);
    }
  } else {
    console.log(`  Legacy plugin path already exists: ${pluginDir}`);
  }

  return pluginDir;
}

export function buildMarketplaceManifest(): Record<string, unknown> {
  return {
    $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
    name: MARKETPLACE_NAME,
    description: "Local marketplace for Claude Memory Harness",
    owner: {
      name: "Claude Memory Harness",
    },
    plugins: [
      {
        name: PLUGIN_NAME,
        description: "Local memory harness for Claude Code",
        source: `./${PLUGIN_NAME}`,
      },
    ],
  };
}

function installLocalMarketplace(claudeDir: string, packageRoot: string): string {
  const marketplaceDir = join(claudeDir, "plugins", MARKETPLACE_NAME);
  const manifestDir = join(marketplaceDir, ".claude-plugin");
  const pluginSourceDir = join(marketplaceDir, PLUGIN_NAME);

  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(
    join(manifestDir, "marketplace.json"),
    `${JSON.stringify(buildMarketplaceManifest(), null, 2)}\n`,
  );

  if (existsSync(pluginSourceDir)) {
    rmSync(pluginSourceDir, { recursive: true, force: true });
  }

  try {
    symlinkSync(packageRoot, pluginSourceDir, "dir");
    console.log(`  Symlinked marketplace plugin: ${pluginSourceDir} -> ${packageRoot}`);
  } catch {
    console.log("  Could not symlink marketplace plugin. Copying plugin files instead.");
    cpSync(packageRoot, pluginSourceDir, { recursive: true });
    console.log(`  Copied marketplace plugin: ${pluginSourceDir}`);
  }

  console.log(`  Wrote local marketplace: ${marketplaceDir}`);
  return marketplaceDir;
}

function registerWithClaudeCli(marketplaceDir: string): void {
  const pluginRef = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

  const marketplace = runClaude(["plugin", "marketplace", "add", marketplaceDir]);
  if (marketplace.ok) {
    console.log(`  Registered Claude marketplace: ${MARKETPLACE_NAME}`);
  } else {
    console.log(`  Could not register marketplace with Claude CLI: ${marketplace.message}`);
    console.log(`  Manual command: claude plugin marketplace add ${marketplaceDir}`);
  }

  const install = runClaude(["plugin", "install", pluginRef, "--scope", "user"]);
  if (install.ok || /already/i.test(install.message)) {
    console.log(`  Installed Claude plugin: ${pluginRef}`);
  } else {
    console.log(`  Could not install plugin with Claude CLI: ${install.message}`);
    console.log(`  Manual command: claude plugin install ${pluginRef} --scope user`);
  }

  const enable = runClaude(["plugin", "enable", pluginRef, "--scope", "user"]);
  if (enable.ok || /already enabled/i.test(enable.message)) {
    console.log(`  Enabled Claude plugin: ${pluginRef}`);
  } else {
    console.log(`  Could not enable plugin with Claude CLI: ${enable.message}`);
    console.log(`  Manual command: claude plugin enable ${pluginRef} --scope user`);
  }
}

function runClaude(args: string[]): { ok: boolean; message: string } {
  const result = spawnSync("claude", args, { encoding: "utf8" });

  if (result.error) {
    return { ok: false, message: result.error.message };
  }

  const message = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return { ok: result.status === 0, message };
}
