#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const fixturesDir = join(projectRoot, "fixtures", "hooks");
const hookRunner = join(projectRoot, "dist", "hooks", "hook-runner.js");

let passed = 0;
let failed = 0;

function runHook(fixtureFile, eventName) {
  const fixture = readFileSync(join(fixturesDir, fixtureFile), "utf-8");
  try {
    const result = execSync(`node ${hookRunner} ${eventName}`, {
      input: fixture,
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, CLAUDE_PLUGIN_DATA: join(projectRoot, ".cmh-test") },
    });
    return JSON.parse(result.trim() || "{}");
  } catch (e) {
    throw new Error(`Hook failed: ${e.message}\nstdout: ${e.stdout}\nstderr: ${e.stderr}`);
  }
}

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${message}`);
  }
}

console.log("Smoke test: Claude Memory Harness hooks\n");

// Test 1: SessionStart
console.log("1. SessionStart hook:");
try {
  const result = runHook("session-start.json", "SessionStart");
  assert(typeof result === "object", "returns valid JSON object");
  if (result.hookSpecificOutput) {
    assert(result.hookSpecificOutput.hookEventName === "SessionStart", "hookEventName is SessionStart");
    assert(typeof result.hookSpecificOutput.additionalContext === "string", "additionalContext is a string");
  } else {
    assert(true, "no memory to inject (empty output is valid)");
  }
} catch (e) {
  assert(false, `SessionStart hook: ${e.message}`);
}

// Test 2: UserPromptSubmit
console.log("\n2. UserPromptSubmit hook:");
try {
  const result = runHook("user-prompt-submit.json", "UserPromptSubmit");
  assert(typeof result === "object", "returns valid JSON object");
  if (result.hookSpecificOutput) {
    assert(result.hookSpecificOutput.hookEventName === "UserPromptSubmit", "hookEventName is UserPromptSubmit");
    assert(typeof result.hookSpecificOutput.additionalContext === "string", "additionalContext is a string");
  } else {
    assert(true, "no relevant memory (empty output is valid)");
  }
} catch (e) {
  assert(false, `UserPromptSubmit hook: ${e.message}`);
}

// Test 3: PostToolUse (Write)
console.log("\n3. PostToolUse hook (Write):");
try {
  const result = runHook("post-tool-use-write.json", "PostToolUse");
  assert(typeof result === "object", "returns valid JSON object");
} catch (e) {
  assert(false, `PostToolUse Write hook: ${e.message}`);
}

// Test 4: PostToolUse (Bash)
console.log("\n4. PostToolUse hook (Bash):");
try {
  const result = runHook("post-tool-use-bash.json", "PostToolUse");
  assert(typeof result === "object", "returns valid JSON object");
} catch (e) {
  assert(false, `PostToolUse Bash hook: ${e.message}`);
}

// Test 5: Stop (without writer configured)
console.log("\n5. Stop hook:");
try {
  const result = runHook("stop.json", "Stop");
  assert(typeof result === "object", "returns valid JSON object");
} catch (e) {
  assert(false, `Stop hook: ${e.message}`);
}

// Test 6: Empty input
console.log("\n6. Empty input handling:");
try {
  const result = execSync(`node ${hookRunner} SessionStart`, {
    input: "",
    encoding: "utf-8",
    timeout: 10000,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: join(projectRoot, ".cmh-test") },
  });
  assert(typeof JSON.parse(result.trim() || "{}") === "object", "handles empty input gracefully");
} catch (e) {
  assert(false, `Empty input: ${e.message}`);
}

// Summary
console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);

// Cleanup
try {
  execSync(`rm -rf ${join(projectRoot, ".cmh-test")}`);
} catch {}

process.exit(failed > 0 ? 1 : 0);
