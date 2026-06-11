#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const fixturesDir = join(projectRoot, "fixtures", "hooks");
const hookRunner = join(projectRoot, "dist", "hooks", "hook-runner.js");
const testDataDir = join(projectRoot, ".cmh-test");
const transcriptPath = join(projectRoot, "fixtures", "transcripts", "simple-session.jsonl");
const configPath = join(testDataDir, "config.json");
const storePath = join(testDataDir, "store.json");

let passed = 0;
let failed = 0;

function runHook(fixtureFile, eventName) {
  const fixture = readFileSync(join(fixturesDir, fixtureFile), "utf-8")
    .replaceAll("__TRANSCRIPT_SIMPLE__", transcriptPath);
  try {
    const result = execSync(`node ${hookRunner} ${eventName}`, {
      input: fixture,
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, CLAUDE_PLUGIN_DATA: testDataDir },
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

function writeTestConfig(config) {
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

function readStore() {
  return JSON.parse(readFileSync(storePath, "utf-8"));
}

function findFile(root, name) {
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      const found = findFile(path, name);
      if (found) return found;
    } else if (entry === name) {
      return path;
    }
  }
  return null;
}

console.log("Smoke test: Claude Memory Harness hooks\n");

try {
  rmSync(testDataDir, { recursive: true, force: true });
  mkdirSync(join(testDataDir, "memories", "global"), { recursive: true });
  writeFileSync(
    join(testDataDir, "memories", "global", "MEMORY.md"),
    "# Auth Module\nThe login bug lives in the auth module and uses JWT authentication.\n",
    "utf-8"
  );
  writeTestConfig({ writer: { enabled: false }, storage: { index: "json-plain-text" } });
} catch (e) {
  console.error(`Failed to prepare smoke data: ${e.message}`);
  process.exit(1);
}

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
  assert(result.hookSpecificOutput?.hookEventName === "UserPromptSubmit", "hookEventName is UserPromptSubmit");
  assert(typeof result.hookSpecificOutput?.additionalContext === "string", "official prompt field retrieved memory context");
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

// Test 5: Stop enqueues writer work without synchronous writer call
console.log("\n5. Stop hook:");
try {
  writeTestConfig({
    writer: {
      enabled: true,
      apiKeyEnv: "__CMH_MISSING_WRITER_KEY__",
    },
    storage: { index: "json-plain-text" },
  });
  const result = runHook("stop.json", "Stop");
  assert(typeof result === "object", "returns valid JSON object");
  const store = readStore();
  assert(store.writer_jobs?.length === 1, "enqueues one writer job");
  assert(store.writer_jobs[0].status === "pending", "writer job remains pending without API key");
  try {
    readFileSync(join(testDataDir, "memories", "projects", store.writer_jobs[0].project_id, "checkpoint.md"), "utf-8");
    assert(false, "does not write checkpoint synchronously");
  } catch {
    assert(true, "does not write checkpoint synchronously");
  }
  writeTestConfig({ writer: { enabled: false }, storage: { index: "json-plain-text" } });
} catch (e) {
  assert(false, `Stop hook: ${e.message}`);
}

// Test 6: PostToolUseFailure
console.log("\n6. PostToolUseFailure hook:");
try {
  const result = runHook("post-tool-use-failure.json", "PostToolUseFailure");
  assert(typeof result === "object", "returns valid JSON object");
} catch (e) {
  assert(false, `PostToolUseFailure hook: ${e.message}`);
}

// Test 7: PreCompact
console.log("\n7. PreCompact hook:");
try {
  const result = runHook("pre-compact.json", "PreCompact");
  assert(typeof result === "object", "returns valid JSON object");
  const handoffPath = findFile(join(testDataDir, "memories", "projects"), "handoff.md");
  assert(!!handoffPath, "writes handoff.md");
  assert(readFileSync(handoffPath, "utf-8").includes("PreCompact instructions"), "handoff includes compact instructions");
} catch (e) {
  assert(false, `PreCompact hook: ${e.message}`);
}

// Test 8: PostCompact
console.log("\n8. PostCompact hook:");
try {
  const result = runHook("post-compact.json", "PostCompact");
  assert(typeof result === "object", "returns valid JSON object");
} catch (e) {
  assert(false, `PostCompact hook: ${e.message}`);
}

// Test 9: Empty input
console.log("\n9. Empty input handling:");
try {
  const result = execSync(`node ${hookRunner} SessionStart`, {
    input: "",
    encoding: "utf-8",
    timeout: 10000,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: testDataDir },
  });
  assert(typeof JSON.parse(result.trim() || "{}") === "object", "handles empty input gracefully");
} catch (e) {
  assert(false, `Empty input: ${e.message}`);
}

// Summary
console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);

// Cleanup
try {
  rmSync(testDataDir, { recursive: true, force: true });
} catch {}

process.exit(failed > 0 ? 1 : 0);
