---
name: config
description: Show or modify Claude Memory Harness configuration
---

Run `cmh config get` using Bash to show the full configuration. To set a specific value, run `cmh config set <key> <value>`. Common settings:
- `writer.baseURL` - OpenAI-compatible API base URL
- `writer.apiKeyEnv` - Environment variable name for the API key
- `writer.model` - Model name to use for checkpoint writing
- `storage.maxInjectedChars` - Maximum characters to inject into context
