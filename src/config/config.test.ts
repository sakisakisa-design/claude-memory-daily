import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let testDataDir: string;

beforeEach(() => {
  testDataDir = join(tmpdir(), `cmh-test-config-${Date.now()}`);
  mkdirSync(testDataDir, { recursive: true });
  process.env.CLAUDE_PLUGIN_DATA = testDataDir;
});

afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA;
  if (existsSync(testDataDir)) {
    rmSync(testDataDir, { recursive: true });
  }
});

describe("config", () => {
  it("loads default config when no file exists", async () => {
    const { loadConfig } = await import("./index.js");
    const config = loadConfig();
    expect(config.enabled).toBe(true);
    expect(config.storage.scope).toBe("user");
    expect(config.writer.provider).toBe("openai-compatible");
    expect(config.writer.model).toBe("gpt-4o-mini");
  });

  it("loads config from file", async () => {
    const configPath = join(testDataDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ writer: { model: "custom-model" } }));

    const { loadConfig } = await import("./index.js");
    const config = loadConfig();
    expect(config.writer.model).toBe("custom-model");
    expect(config.writer.provider).toBe("openai-compatible");
  });

  it("saves and reloads config", async () => {
    const { loadConfig, saveConfig } = await import("./index.js");
    const config = loadConfig();
    config.writer.model = "test-model";
    saveConfig(config);

    const reloaded = loadConfig();
    expect(reloaded.writer.model).toBe("test-model");
  });

  it("ensures data directory structure", async () => {
    const { ensureDataDir } = await import("./index.js");
    const dir = ensureDataDir();
    expect(existsSync(join(dir, "logs"))).toBe(true);
    expect(existsSync(join(dir, "memories", "global"))).toBe(true);
    expect(existsSync(join(dir, "memories", "projects"))).toBe(true);
    expect(existsSync(join(dir, "raw", "transcripts"))).toBe(true);
  });

  it("resolves API key from environment", async () => {
    const { resolveApiKey, loadConfig } = await import("./index.js");
    process.env.TEST_API_KEY = "test-key-123";
    const config = loadConfig();
    config.writer.apiKeyEnv = "TEST_API_KEY";
    expect(resolveApiKey(config)).toBe("test-key-123");
    delete process.env.TEST_API_KEY;
  });

  it("gets and sets config values", async () => {
    const { setConfigValue, getConfigValue, saveConfig, loadConfig } = await import("./index.js");
    saveConfig(loadConfig());
    setConfigValue("writer.model", "new-model");
    expect(getConfigValue("writer.model")).toBe("new-model");
  });
});
