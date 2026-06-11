# Claude Memory Harness

A local memory plugin for Claude Code that provides cross-session memory through hook-based context injection, searchable project/global memory, and optional checkpoint writing.

## Features

- **Hook-based memory injection**: Automatically injects relevant memory at session start and before each prompt
- **Local storage**: All data stays on your machine (JSON store + Markdown files)
- **Searchable memory**: Plain-text search across project/global memory and indexed summaries, including CJK bigram matching
- **Optional checkpoints**: Writes structured session checkpoints via a configurable writer model when enabled
- **Safe handoff**: Generates `handoff.md` before/after compaction without mutating Claude Code transcripts
- **Project and global memory**: Per-project memory files plus optional global memory
- **Privacy-first**: No cloud sync, no data leaves your machine except configured writer calls
- **Experimental dream consolidation**: Manual memory cleanup command using the regular writer contract

## Quick Start

### Install

```bash
npm install -g claude-memory-harness
cmh install
```

### Configure Writer Model

The writer model generates checkpoints and memory patches. Configure any OpenAI-compatible endpoint:

```bash
cmh config set writer.baseURL https://api.openai.com/v1
cmh config set writer.apiKeyEnv OPENAI_API_KEY
cmh config set writer.model gpt-4o-mini
cmh config set writer.enabled true
```

Then set the environment variable:

```bash
export OPENAI_API_KEY="your-key-here"
```

### Use with Claude Code

Restart Claude Code or run `/reload-plugins`. Memory injection starts automatically.

For development:

```bash
claude --plugin-dir ./
```

## Configuration

Config file location: `~/.cmh/config.json`

```json
{
  "enabled": true,
  "storage": {
    "scope": "user",
    "index": "json-plain-text",
    "maxInjectedChars": 12000,
    "lockStaleMs": 30000
  },
  "handoff": {
    "enabled": true,
    "maxChars": 12000,
    "maxTranscriptEntries": 30
  },
  "writer": {
    "enabled": false,
    "provider": "openai-compatible",
    "baseURL": "https://api.openai.com/v1",
    "apiKeyEnv": "OPENAI_API_KEY",
    "model": "gpt-4o-mini",
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

### Configuration Options

| Key | Description | Default |
|-----|-------------|---------|
| `enabled` | Enable/disable the plugin | `true` |
| `storage.maxInjectedChars` | Max characters injected into context | `12000` |
| `storage.lockStaleMs` | Recover JSON store locks older than this many milliseconds | `30000` |
| `handoff.enabled` | Enable handoff generation on compact hooks | `true` |
| `handoff.maxChars` | Max characters in generated handoff.md | `12000` |
| `handoff.maxTranscriptEntries` | Transcript tail entries included in handoff | `30` |
| `writer.enabled` | Enable checkpoint writing | `false` |
| `writer.baseURL` | OpenAI-compatible API base URL | `https://api.openai.com/v1` |
| `writer.apiKeyEnv` | Environment variable name for API key | `OPENAI_API_KEY` |
| `writer.apiKey` | Direct API key (not recommended) | - |
| `writer.model` | Model name | `gpt-4o-mini` |
| `writer.temperature` | Sampling temperature | `0.1` |
| `writer.maxTokens` | Max tokens in writer response | `4000` |
| `writer.timeoutMs` | Writer request timeout | `45000` |

Redaction is always applied on hook capture, transcript parsing, writer prompts, and config display. The `redaction` config block is retained for compatibility and future display tuning; setting `redaction.enabled` to `false` does not disable redaction on those sensitive paths.

## CLI Commands

```bash
cmh install              # Install the plugin
cmh doctor               # Check installation and configuration
cmh status               # Show current status
cmh config get [key]     # Get config value or show all
cmh config set <key> <value>  # Set a config value
cmh memory search <query>     # Search memory
cmh memory list          # List memory files
cmh memory reindex       # Reindex memory into search
cmh checkpoint now       # Write a checkpoint now
cmh checkpoint now --dry-run  # Preview checkpoint prompt
cmh checkpoint show      # Show current checkpoint
cmh handoff              # Generate handoff.md for the current project
cmh handoff --show       # Show the current handoff
cmh forge dry-run <transcript>  # Inspect a transcript forge plan without writing files
cmh dream                # Experimental memory consolidation preview
cmh dream --apply        # Apply experimental memory consolidation
cmh forget project --confirm  # Clear project memory
cmh forget global --confirm   # Clear global memory
cmh forget checkpoint --confirm  # Clear checkpoint
```

## Plugin Skills (inside Claude Code)

- `/claude-memory-harness:status` - Show status
- `/claude-memory-harness:search` - Search memory
- `/claude-memory-harness:checkpoint` - Write checkpoint
- `/claude-memory-harness:dream` - Consolidate memory
- `/claude-memory-harness:forget` - Clear memories
- `/claude-memory-harness:config` - Manage configuration

## How It Works

### Hooks

1. **SessionStart**: Loads project/global memory and checkpoint, injects as context
2. **UserPromptSubmit**: Searches memory for relevant context based on the prompt
3. **PostToolUse**: Asynchronously records high-signal Bash and file-edit events
4. **PostToolUseFailure**: Asynchronously records failures for the same high-signal tools
5. **PreCompact**: Writes a safe handoff before compaction
6. **PostCompact**: Captures compacted session summaries and refreshes handoff
7. **Stop / SessionEnd**: Enqueues throttled checkpoint writer work; configured writer calls run in a background worker

Claude Code has its own auto memory at `~/.claude/projects/<project>/memory/`. Claude Memory Harness stores plugin data separately in Claude's plugin data directory and does not read or write Claude Code's auto-memory files. Keep the harness writer disabled unless you explicitly want an additional checkpoint layer.
Forge is dry-run only in v0: it reports a proposed session id, retained event count, token estimate, and output path, but never writes forged JSONL or overwrites the original transcript.
Dream is experimental in v0 and uses the normal checkpoint writer contract rather than a separate dream-specific model mode.

### Memory Files

```
~/.cmh/
  config.json
  store.json
  memories/
    global/
      MEMORY.md
    projects/
      <project-id>/
        MEMORY.md
        checkpoint.md
        notes.md
        handoff.md
```

Memory overwrites keep a quick rollback `.bak` file plus the latest five timestamped `.bak.*` backups.

### Project ID

Projects are identified by a hash of the git remote URL and repo root path. Non-git directories use a hash of the working directory.

## Privacy

- All memory is stored locally on your machine
- The only external call is to your configured writer endpoint during checkpoint writing
- Secrets are automatically redacted from stored content (API keys, tokens, passwords, private keys)
- Environment variable values are replaced with variable names when detected
- No telemetry or analytics

### Recommended .gitignore

```gitignore
.claude-memory/
.cmh/
```

## Uninstall

```bash
# Remove the plugin symlink
rm -rf ~/.claude/plugins/claude-memory-harness

# Remove data (optional)
rm -rf ~/.cmh

# Uninstall npm package
npm uninstall -g claude-memory-harness
```

## Troubleshooting

### Plugin not loading

1. Run `cmh doctor` to check installation
2. Ensure `~/.claude/plugins/claude-memory-harness` exists
3. Restart Claude Code or run `/reload-plugins`

### Writer not working

1. Check API key: `echo $OPENAI_API_KEY`
2. Test connectivity: `curl <baseURL>/models -H "Authorization: Bearer $OPENAI_API_KEY"`
3. Check config: `cmh config get writer`
4. Run `cmh doctor` to verify

### No memory injected

1. Check if memory files exist: `cmh memory list`
2. Checkpoint memory is only created after sessions with the writer configured and `writer.enabled` set to `true`
3. First session will have no prior memory (expected)

### Search returns no results

1. Run `cmh memory reindex` to refresh indexed summaries
2. Check that memory files or indexed summaries contain the query terms
3. v0 uses the JSON store plus plain-text search; SQLite FTS5 is not implemented yet

## Development

```bash
git clone <repo>
npm install
npm run build
npm test
npm run smoke:hooks

# Test with Claude Code locally
claude --plugin-dir ./
```

## License

MIT - see [LICENSE](LICENSE)
