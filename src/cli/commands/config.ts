import { Command } from "commander";
import { loadConfig, getConfigValue, setConfigValue } from "../../config/index.js";
import { redactValue } from "../../redaction/index.js";

export const configCmd = new Command("config")
  .description("Manage Claude Memory Harness configuration");

configCmd
  .command("get [key]")
  .description("Get a config value (or show all config)")
  .action((key?: string) => {
    if (key) {
      const value = getConfigValue(key);
      if (value === undefined) {
        console.log(`${key}: (not set)`);
      } else {
        console.log(`${key}: ${JSON.stringify(redactConfigValue(key, value))}`);
      }
    } else {
      const config = loadConfig();
      console.log(JSON.stringify(redactConfigValue("", config), null, 2));
    }
  });

configCmd
  .command("set <key> <value>")
  .description("Set a config value")
  .action((key: string, value: string) => {
    setConfigValue(key, value);
    console.log(`Set ${key} = ${JSON.stringify(redactConfigValue(key, value))}`);
  });

function redactConfigValue(key: string, value: unknown): unknown {
  if (key.toLowerCase().endsWith("apikey")) {
    return value ? "[REDACTED]" : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactConfigValue("", item));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const path = key ? `${key}.${childKey}` : childKey;
      result[childKey] = redactConfigValue(path, childValue);
    }
    return redactValue(result);
  }
  return redactValue(value);
}
