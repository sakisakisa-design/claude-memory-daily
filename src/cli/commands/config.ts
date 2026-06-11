import { Command } from "commander";
import { loadConfig, getConfigValue, setConfigValue } from "../../config/index.js";

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
        console.log(`${key}: ${JSON.stringify(value)}`);
      }
    } else {
      const config = loadConfig();
      console.log(JSON.stringify(config, null, 2));
    }
  });

configCmd
  .command("set <key> <value>")
  .description("Set a config value")
  .action((key: string, value: string) => {
    setConfigValue(key, value);
    console.log(`Set ${key} = ${value}`);
  });
