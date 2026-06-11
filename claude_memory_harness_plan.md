# Claude Code Memory Harness — Implementation Plan for Codex Goal Mode

## 0. Purpose

Build a Claude Code plugin that gives ordinary Claude Code users a local, install-and-use long-horizon memory layer inspired by MiMoCode’s memory design.

The plugin should work after installation inside Claude Code. It should not require users to migrate to another coding agent. It should not be framed as a roleplay, companionship, or human-AI relationship project. It is a general-purpose developer memory plugin for coding sessions.

The core idea:

- Claude Code remains the main coding agent.
- This plugin observes Claude Code lifecycle events through hooks.
- It injects relevant memory into Claude Code context at session start and before user prompts.
- It writes structured checkpoints and project memories through a separate writer process.
- The writer process must use a user-configurable model endpoint, API key, and model name.
- The project should reuse MiMoCode ideas and, where practical, small reusable code patterns, but must not fork or embed OpenCode as a runtime dependency.

## 1. Primary product goal

A user should be able to install this plugin, configure a writer model, open Claude Code in a project, and immediately benefit from cross-session memory.

The first public version should support:

1. Local memory storage.
2. Claude Code hook-based context injection.
3. Automatic checkpoint writing after sessions or stops.
4. A configurable checkpoint-writer model.
5. Project memory and global memory.
6. A small command/skill surface for status, search, manual checkpoint, dream, and config help.
7. Safe defaults for normal developers.

This is not an OpenCode compatibility layer. This is not a Codex adapter. This is not a Claude Code subagent adapter in the first version.

## 2. Context and design references

Read these before implementation:

- MiMoCode repository: https://github.com/XiaomiMiMo/MiMo-Code
- MiMoCode long-horizon memory blog: https://mimo.xiaomi.com/zh/blog/mimo-code-long-horizon
- Claude Code plugin docs: https://code.claude.com/docs/en/plugins
- Claude Code plugin reference: https://code.claude.com/docs/en/plugins-reference
- Claude Code hooks docs: https://code.claude.com/docs/en/hooks
- OpenAI Codex goal mode docs: https://developers.openai.com/codex/use-cases/follow-goals

Relevant MiMoCode ideas to port conceptually:

- `MEMORY.md` for project-level persistent knowledge.
- `checkpoint.md` for structured session state.
- `notes.md` as scratch space.
- SQLite FTS5-style indexing for local memory search.
- Budgeted memory injection.
- Checkpoint writer as a separate actor/process, not part of the main agent loop.
- Dream-like memory cleanup and consolidation.

Do not copy MiMo branding. Source code is MIT licensed, but MiMo names/logos/trademarks should not be reused in this project name or UI.

## 3. Proposed package name

Working name:

`claude-memory-harness`

Alternative names:

- `claude-code-memory-harness`
- `claude-local-memory`
- `memory-harness-for-claude-code`

Avoid:

- `mimocode-plugin`
- `mimo-memory`
- Anything that implies official Xiaomi MiMo affiliation.

## 4. Non-goals

Do not implement these in v1:

- No OpenCode compatibility.
- No Codex adapter.
- No Gemini adapter.
- No cloud sync.
- No hosted SaaS backend.
- No vector database requirement.
- No Claude Code Subagent Adapter.
- No custom Claude Code replacement agent.
- No UI dashboard beyond CLI/skills.
- No automatic upload of transcripts to any remote service except the configured writer model call.
- No hard-coded writer provider or hard-coded model.

## 5. Target UX

### 5.1 Install

The installation should be friendly for ordinary users.

Preferred v1 UX:

```bash
npm install -g claude-memory-harness
cmh install
```

`cmh install` should:

1. Copy or symlink the Claude Code plugin into the user-level Claude Code plugin/skills directory.
2. Create plugin data directories if needed.
3. Create a default config file.
4. Print the next steps:
   - configure writer endpoint/key/model
   - restart Claude Code or run `/reload-plugins`
   - run `/claude-memory-harness:status` inside Claude Code

For development, support:

```bash
claude --plugin-dir ./packages/claude-plugin
```

Do not require a marketplace for v1. Prepare the structure so it can later be distributed through a Claude Code plugin marketplace.

### 5.2 Configure writer model

The user must be able to use their own endpoint, key, and model.

Example config:

```json
{
  "enabled": true,
  "storage": {
    "scope": "user",
    "index": "sqlite-fts5",
    "maxInjectedChars": 12000
  },
  "writer": {
    "enabled": true,
    "provider": "openai-compatible",
    "baseURL": "https://api.openai.com/v1",
    "apiKeyEnv": "OPENAI_API_KEY",
    "model": "gpt-5-mini",
    "temperature": 0.1,
    "maxTokens": 4000,
    "timeoutMs": 45000
  },
  "redaction": {
    "enabled": true,
    "redactEnvValues": true,
    "redactCommonSecretPatterns": true
  }
}
```

Support at least:

- `provider: "openai-compatible"`
- `baseURL`
- `apiKeyEnv`
- `apiKey` as an escape hatch, but warn users not to store secrets directly in config.
- `model`
- `temperature`
- `maxTokens`
- `timeoutMs`

Optional later:

- `provider: "anthropic"`
- `provider: "ollama"`
- `provider: "openrouter"`

Do not block the architecture on these optional providers.

### 5.3 Use

Normal user flow:

1. User installs plugin.
2. User configures writer model.
3. User opens Claude Code in a project.
4. `SessionStart` hook injects existing project/global memory if present.
5. `UserPromptSubmit` hook searches memory based on the new user prompt and injects relevant context.
6. `PostToolUse` / `PostToolUseFailure` records high-signal tool events.
7. `Stop` or `SessionEnd` triggers checkpoint writer.
8. Next session resumes with useful memory.

## 6. Architecture

## 6.1 Repository layout

Create a monorepo or simple package layout like this:

```text
claude-memory-harness/
  package.json
  README.md
  LICENSE
  PLAN.md

  packages/
    core/
      src/
        config/
        storage/
        search/
        transcript/
        writer/
        inject/
        redaction/
        utils/
      tests/

    cli/
      src/
        index.ts
        commands/
      tests/

    claude-plugin/
      .claude-plugin/
        plugin.json
      hooks/
        hooks.json
      scripts/
        session-start.ts
        user-prompt-submit.ts
        post-tool-use.ts
        post-tool-use-failure.ts
        post-compact.ts
        stop.ts
        session-end.ts
      skills/
        status/
          SKILL.md
        search/
          SKILL.md
        checkpoint/
          SKILL.md
        dream/
          SKILL.md
        forget/
          SKILL.md
        config/
          SKILL.md
      bin/
        cmh
```

The plugin should call into the built CLI/core rather than duplicating logic inside every hook script.

## 6.2 Runtime data layout

Use Claude plugin data directory when available.

Expected env vars from Claude Code plugin runtime:

- `CLAUDE_PLUGIN_ROOT`
- `CLAUDE_PLUGIN_DATA`

Data layout:

```text
${CLAUDE_PLUGIN_DATA}/
  config.json
  memory.sqlite
  logs/
    cmh.log
  raw/
    events.jsonl
    transcripts/
  memories/
    global/
      MEMORY.md
    projects/
      <project-id>/
        MEMORY.md
        notes.md
        checkpoint.md
        tasks/
  queue/
    writer-jobs/
  cache/
    npm/
```

Project ID strategy:

- Prefer stable git remote URL hash + repo root path hash.
- Fall back to cwd hash if not inside a git repo.
- Store a human-readable alias in SQLite for diagnostics.

## 6.3 Storage

Use local storage only.

Primary v1 storage:

- Markdown files for user-editable memory.
- SQLite database for indexing and raw metadata.
- SQLite FTS5 for search if available.
- Fallback to a pure JS plain-text search if SQLite FTS5 is unavailable.

Suggested tables:

```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  project_id TEXT,
  session_id TEXT,
  type TEXT NOT NULL,
  path TEXT,
  title TEXT,
  body TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  id UNINDEXED,
  scope,
  project_id UNINDEXED,
  type,
  title,
  body,
  tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  project_id TEXT,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS writer_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  project_id TEXT,
  status TEXT NOT NULL,
  input_json TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Index at least:

- global `MEMORY.md`
- project `MEMORY.md`
- project `checkpoint.md`
- project `notes.md`
- high-signal raw session summaries
- dream outputs

Do not index raw full transcripts into injection candidates by default. Raw transcripts can be used by the writer, but ordinary injection should prefer curated memory and checkpoints.

## 6.4 Claude Code hooks

Implement these hooks:

### SessionStart

Purpose:

- Ensure data directory exists.
- Ensure dependencies/config are ready.
- Resolve current project ID.
- Load global memory, project memory, and current checkpoint.
- Return a compact `additionalContext` block.

Behavior:

- Must be fast.
- Must not call remote writer model.
- Must not block Claude Code if memory fails.
- If error occurs, log it and inject nothing.

Output:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<compact memory context>"
  }
}
```

### UserPromptSubmit

Purpose:

- Read the submitted user prompt from hook input.
- Search memory using the prompt, cwd, git branch, and recent project hints.
- Return relevant memory snippets as `additionalContext`.

Behavior:

- Must have a strict token/character budget.
- Must include only high-confidence results.
- Must label memory as advisory, not authoritative.
- Must avoid injecting secrets.

Output:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "<relevant memory context>"
  }
}
```

### PostToolUse

Purpose:

- Record high-signal tool use.
- Do not record every tiny detail.

Record:

- file writes/edits
- bash commands
- failed commands if visible here
- important file paths
- git branch
- cwd
- basic result status

Do not record:

- huge command output without truncation
- environment variables
- obvious secrets
- full generated files unless small and useful

### PostToolUseFailure

Purpose:

- Record failure events.
- Optionally inject a small reminder when a known repeated failure pattern is detected.

### PostCompact

Purpose:

- Capture compacted session summary if available.
- Store it as a summary event.
- Do not run writer synchronously unless cheap and safe.

### Stop or SessionEnd

Purpose:

- Trigger checkpoint writing.

Behavior:

- If writer is configured and enabled, run checkpoint writer.
- Use timeout.
- If timeout or network failure occurs, enqueue a writer job and exit cleanly.
- Never break Claude Code shutdown because writer failed.
- Log the failure and surface it via `/status`.

## 6.5 Writer process

The writer is a separate local process, not a Claude Code subagent.

Input:

- current project memory
- current global memory
- current checkpoint
- project notes
- recent transcript tail
- compacted summaries
- high-signal tool events
- current cwd/git branch/project ID
- current user prompt if available

Output:

- updated `checkpoint.md`
- optional patch to project `MEMORY.md`
- optional patch to global `MEMORY.md`
- optional cleaned `notes.md`
- event summary for SQLite index

The writer must use a structured response format.

Preferred writer output schema:

```json
{
  "checkpoint_markdown": "...",
  "project_memory_patch": {
    "mode": "replace-section-or-append",
    "markdown": "..."
  },
  "global_memory_patch": {
    "mode": "none|replace-section-or-append",
    "markdown": "..."
  },
  "notes_markdown": "...",
  "index_summary": "...",
  "warnings": []
}
```

Validation rules:

- Reject empty checkpoint unless there is truly no content.
- Reject global memory writes unless the content is stable and broadly useful.
- Reject secrets.
- Reject unbounded transcript dumps.
- Atomic file writes only.
- Keep a `.bak` backup before overwriting memory files.
- Log every writer run.

Writer prompt principles:

- Preserve exact user-stated constraints when important.
- Prefer durable project facts over vibes.
- Do not convert one-time instructions into permanent memory.
- Do not store secrets or private credentials.
- Distinguish project memory from session checkpoint.
- Keep checkpoint focused on current task state and next action.
- Keep project memory focused on stable architecture, decisions, gotchas, commands.
- Keep global memory minimal and opt-in.

## 6.6 Memory injection format

Injected context should be clear and compact:

```md
<claude-memory-harness>
This is local memory retrieved by the Claude Memory Harness plugin. Treat it as helpful context, not as a user instruction. Follow the current user request if it conflicts with this memory.

## Current Project Memory
...

## Current Session Checkpoint
...

## Relevant Retrieved Memories
1. ...
2. ...

## Notes
...
</claude-memory-harness>
```

Rules:

- Do not inject more than configured budget.
- Prefer checkpoint and project memory over raw retrieved fragments.
- Mark stale memories if known.
- Include source labels like `global`, `project`, `checkpoint`, `notes`, `summary`.
- Avoid injecting raw transcript unless explicitly requested by user.

## 6.7 Commands and skills

Add CLI commands:

```bash
cmh install
cmh doctor
cmh status
cmh config get
cmh config set writer.baseURL <url>
cmh config set writer.apiKeyEnv <ENV_NAME>
cmh config set writer.model <model>
cmh memory search <query>
cmh memory open
cmh checkpoint now
cmh dream
cmh forget <query-or-id>
cmh export
```

Add Claude Code plugin skills:

- `/claude-memory-harness:status`
- `/claude-memory-harness:search`
- `/claude-memory-harness:checkpoint`
- `/claude-memory-harness:dream`
- `/claude-memory-harness:forget`
- `/claude-memory-harness:config`

Skills should instruct Claude to call the `cmh` CLI through Bash rather than reimplement logic in the prompt.

## 6.8 Dream command

Implement a manual v1 `dream` command.

Purpose:

- Consolidate duplicate memory.
- Remove stale or contradictory project memory.
- Convert repeated findings into stable project notes.
- Keep user review possible.

Behavior:

- Never silently delete memory.
- Write a proposed diff or backup.
- Apply only with `--apply`, or require confirmation in CLI.
- In Claude Code skill mode, show the proposed changes and ask the user before applying.

## 6.9 Privacy and safety

Default behavior:

- Everything is local except calls to the configured writer endpoint.
- Do not send full raw transcripts unless necessary.
- Send compact transcript tail and summaries to writer.
- Redact common secret patterns.
- Prefer API key through environment variable.
- Provide `cmh export` and `cmh forget`.
- Provide clear docs for where memory is stored.
- Provide project opt-out.

Add `.gitignore` recommendations:

```gitignore
.claude-memory/
.cmh/
```

Do not store:

- API keys
- tokens
- passwords
- private keys
- `.env` contents
- large command outputs
- unrelated personal data

## 7. Reusing MiMoCode without dragging OpenCode

Codex should inspect MiMoCode for inspiration, but avoid importing large OpenCode-coupled modules.

Likely useful to inspect:

- memory FTS schema/query logic
- checkpoint templates
- checkpoint writer prompts
- Claude transcript import logic
- memory file path conventions
- memory reconciliation patterns

Avoid copying:

- OpenCode provider runtime
- TUI
- actor registry
- session bus
- task registry
- subagent system
- compose mode
- workflow engine

If copying code, preserve MIT license notices and keep attribution in `NOTICE.md`.

Prefer reimplementing small pieces when direct copy would pull in OpenCode dependencies.

## 8. Implementation milestones

## Milestone 1 — Scaffold

Deliver:

- package structure
- TypeScript config
- build/test/lint scripts
- CLI entrypoint
- plugin manifest
- hooks file
- README skeleton
- sample config

Acceptance:

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Milestone 2 — Config and storage

Deliver:

- config loader
- project ID resolver
- data directory manager
- SQLite or fallback search store
- markdown memory files
- index/reindex command

Acceptance:

```bash
cmh doctor
cmh config get
cmh memory search "test"
```

## Milestone 3 — Hook bridge and injection

Deliver:

- SessionStart hook
- UserPromptSubmit hook
- injection builder
- budgeted memory context
- hook input fixtures
- smoke tests

Acceptance:

```bash
npm run smoke:hooks
```

The smoke test must simulate Claude Code hook JSON and verify valid `additionalContext` output.

## Milestone 4 — Transcript import and event logging

Deliver:

- robust JSONL transcript parser
- event store
- PostToolUse logger
- PostToolUseFailure logger
- PostCompact summary capture
- redaction and truncation

Acceptance:

- fixtures parse without crashing
- secrets are redacted
- large outputs are truncated
- events are indexed or stored

## Milestone 5 — Configurable writer

Deliver:

- OpenAI-compatible writer client
- config fields for baseURL/apiKeyEnv/apiKey/model
- timeout handling
- writer prompt
- structured output parser
- checkpoint writer command
- queued job fallback
- atomic writes and backups

Acceptance:

```bash
cmh checkpoint now --dry-run
cmh checkpoint now
```

Must work with:

- mock writer provider in tests
- a real OpenAI-compatible endpoint when configured by user

Do not hard-code any model.

## Milestone 6 — User-facing install and skills

Deliver:

- `cmh install`
- plugin skills
- docs for install/config/use
- `/status` skill
- `/search` skill
- `/checkpoint` skill
- `/dream` skill
- `/forget` skill
- troubleshooting section

Acceptance:

- local install works
- Claude Code plugin is visible
- `/reload-plugins` or restart loads it
- status command shows config/storage/writer state

## Milestone 7 — Dream and cleanup

Deliver:

- manual dream command
- proposed diff mode
- apply mode
- backups
- docs

Acceptance:

```bash
cmh dream --dry-run
cmh dream --apply
```

## 9. Tests

Required tests:

- config loading
- config env var resolution
- project ID resolution
- redaction
- FTS/fallback search
- injection budget trimming
- transcript parsing
- writer prompt input construction
- writer structured output parsing
- atomic memory writes
- hook smoke tests
- CLI command tests

Add fixtures:

```text
fixtures/
  hooks/
    session-start.json
    user-prompt-submit.json
    post-tool-use-write.json
    post-tool-use-bash.json
    stop.json
  transcripts/
    simple-session.jsonl
    tool-heavy-session.jsonl
    malformed-lines.jsonl
```

## 10. Done criteria

The implementation is done when all of these are true:

1. `npm run build` passes.
2. `npm run typecheck` passes.
3. `npm test` passes.
4. `npm run smoke:hooks` passes.
5. `cmh doctor` gives actionable output.
6. `cmh install` installs the plugin for a normal user-level Claude Code setup.
7. `SessionStart` produces valid `additionalContext` when memory exists.
8. `UserPromptSubmit` retrieves and injects relevant memory.
9. `Stop` or `SessionEnd` can trigger checkpoint writing.
10. Writer model is configurable by endpoint, key env var, and model.
11. No hard-coded writer provider/model exists.
12. README explains install, config, privacy, uninstall, and troubleshooting.
13. Memory remains local except configured writer calls.
14. The repo includes `NOTICE.md` if MiMoCode code is copied or adapted.

## 11. Suggested Codex `/goal`

Use this in Codex Goal Mode after placing this file in the repository as `PLAN.md`:

```text
/goal Implement PLAN.md as a working Claude Code memory plugin. Build a user-installable local memory harness for Claude Code with hook-based memory injection, local storage, searchable project/global memory, automatic checkpoint writing, and a configurable checkpoint-writer model endpoint/key/model. Do not build OpenCode compatibility, Codex compatibility, Gemini compatibility, cloud sync, or a Claude Code Subagent Adapter.

Before coding, read PLAN.md, README if present, package.json if present, and the official Claude Code plugin/hooks docs linked in PLAN.md. Inspect XiaomiMiMo/MiMo-Code only for memory/checkpoint design inspiration and small reusable MIT-licensed patterns; do not pull in OpenCode runtime dependencies.

Work in checkpoints:
1. Scaffold package, plugin manifest, hooks, CLI, tests, and docs.
2. Implement config, storage, project ID resolution, memory files, and search.
3. Implement SessionStart and UserPromptSubmit hook injection with smoke tests.
4. Implement transcript/event logging with redaction and truncation.
5. Implement configurable OpenAI-compatible writer and checkpoint writing.
6. Implement install command, user-facing skills, doctor/status/search/checkpoint/dream/forget commands.
7. Finish README, NOTICE if needed, and troubleshooting docs.

Validation loop:
- Run npm install if dependencies are missing.
- Run npm run build.
- Run npm run typecheck.
- Run npm test.
- Run npm run smoke:hooks.
- Run cmh doctor if available.
- Fix failures and rerun until clean.

Definition of done:
- A normal user can install the plugin with cmh install, configure writer.baseURL/writer.apiKeyEnv/writer.model, restart or reload Claude Code, and get memory injection on new sessions and prompts.
- Checkpoint writing works with a mock writer in tests and with a real OpenAI-compatible endpoint when configured.
- No secrets are stored or injected by default.
- Documentation clearly explains install, config, usage, privacy, uninstall, and limitations.
- All validation commands pass.
```

## 12. Notes for Codex

Important implementation guidance:

- Keep the implementation boring and reliable.
- Prefer small modules over clever abstractions.
- Hooks must fail open: if memory breaks, Claude Code should continue normally.
- Writer failures must never break Claude Code shutdown.
- Do not inject huge context.
- Do not store raw secrets.
- Do not turn one-off user instructions into permanent memory.
- Use explicit logs and `cmh doctor` for troubleshooting.
- Optimize for ordinary users who do not want to understand the internals.

