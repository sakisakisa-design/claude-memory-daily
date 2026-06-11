#!/usr/bin/env node

import { Command } from "commander";
import { installCmd } from "./commands/install.js";
import { doctorCmd } from "./commands/doctor.js";
import { statusCmd } from "./commands/status.js";
import { configCmd } from "./commands/config.js";
import { memoryCmd } from "./commands/memory.js";
import { checkpointCmd } from "./commands/checkpoint.js";
import { dreamCmd } from "./commands/dream.js";
import { forgetCmd } from "./commands/forget.js";

const program = new Command();

program
  .name("cmh")
  .description("Claude Memory Harness - local memory plugin for Claude Code")
  .version("0.1.0");

program.addCommand(installCmd);
program.addCommand(doctorCmd);
program.addCommand(statusCmd);
program.addCommand(configCmd);
program.addCommand(memoryCmd);
program.addCommand(checkpointCmd);
program.addCommand(dreamCmd);
program.addCommand(forgetCmd);

program.parse();
