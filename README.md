# Claude Memory Harness

A local memory plugin for Claude Code that provides cross-session memory through hook-based context injection, searchable project/global memory, and automatic checkpoint writing.

## Features

- **Hook-based memory injection**: Automatically injects relevant memory at session start and before each prompt
- **Local storage**: All data stays on your machine (JSON store + Markdown files)
- **Searchable memory**: Plain-text search across project/global memory and indexed summaries
- **Automatic checkpoints**: Writes structured session checkpoints via a configurable writer model
- **Project and global memory**: Per-project memory files plus optional global memory
- **Privacy-first**: No cloud sync, no data leaves your machine except configured writer calls
- **Dream consolidation**: Manual memory cleanup and deduplication command

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
    "maxInjectedChars": 12000
  },
  "writer": {
    "enabled": true,
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
| `writer.enabled` | Enable checkpoint writing | `true` |
| `writer.baseURL` | OpenAI-compatible API base URL | `https://api.openai.com/v1` |
| `writer.apiKeyEnv` | Environment variable name for API key | `OPENAI_API_KEY` |
| `writer.apiKey` | Direct API key (not recommended) | - |
| `writer.model` | Model name | `gpt-4o-mini` |
| `writer.temperature` | Sampling temperature | `0.1` |
| `writer.maxTokens` | Max tokens in writer response | `4000` |
| `writer.timeoutMs` | Writer request timeout | `45000` |

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
cmh dream                # Consolidate memory (dry run)
cmh dream --apply        # Apply memory consolidation
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
3. **PostToolUse**: Records high-signal tool events (file writes, bash commands)
4. **PostToolUseFailure**: Records failure events
5. **PostCompact**: Captures compacted session summaries
6. **Stop / SessionEnd**: Enqueues throttled checkpoint writer work; configured writer calls run in a background worker

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
```

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
2. Memory is only created after sessions with the writer configured
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
