import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export interface WriterConfig {
  enabled: boolean;
  provider: string;
  baseURL: string;
  apiKeyEnv: string;
  apiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface CMHConfig {
  enabled: boolean;
  storage: {
    scope: string;
    index: string;
    maxInjectedChars: number;
  };
  writer: WriterConfig;
  redaction: {
    enabled: boolean;
    redactEnvValues: boolean;
    redactCommonSecretPatterns: boolean;
  };
}

const DEFAULT_CONFIG: CMHConfig = {
  enabled: true,
  storage: {
    scope: "user",
    index: "json-plain-text",
    maxInjectedChars: 12000,
  },
  writer: {
    enabled: true,
    provider: "openai-compatible",
    baseURL: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    model: "gpt-4o-mini",
    temperature: 0.1,
    maxTokens: 4000,
    timeoutMs: 45000,
  },
  redaction: {
    enabled: true,
    redactEnvValues: true,
    redactCommonSecretPatterns: true,
  },
};

export function getDataDir(): string {
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;
  if (pluginData) return pluginData;
  return join(homedir(), ".cmh");
}

export function getConfigPath(): string {
  return join(getDataDir(), "config.json");
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object" && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

export function loadConfig(): CMHConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, parsed) as unknown as CMHConfig;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: CMHConfig): void {
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function ensureDataDir(): string {
  const dir = getDataDir();
  const subdirs = [
    "logs",
    "raw/transcripts",
    "memories/global",
    "memories/projects",
    "queue/writer-jobs",
    "cache",
  ];
  for (const sub of subdirs) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  return dir;
}

export function getConfigValue(key: string): unknown {
  const config = loadConfig();
  const parts = key.split(".");
  let current: unknown = config;
  for (const part of parts) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  const parts = key.split(".");
  let current: Record<string, unknown> = config as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  const lastKey = parts[parts.length - 1];
  const existing = current[lastKey];
  if (typeof existing === "number") {
    current[lastKey] = Number(value);
  } else if (typeof existing === "boolean") {
    current[lastKey] = value === "true";
  } else {
    current[lastKey] = value;
  }
  saveConfig(config as unknown as CMHConfig);
}

export function resolveApiKey(config: CMHConfig): string | undefined {
  if (config.writer.apiKey) return config.writer.apiKey;
  return process.env[config.writer.apiKeyEnv];
}
