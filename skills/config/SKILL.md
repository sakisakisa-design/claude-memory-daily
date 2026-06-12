---
name: config
description: Show or modify Claude Memory Harness configuration
---

Use the skill base directory shown by Claude to run the bundled CLI, avoiding PATH-dependent `cmh` lookups:

```bash
cd "<skill base directory>/../.." && node dist/cli/index.js config get
```

Show the full configuration. To set a specific value, run `node dist/cli/index.js config set <key> <value>` from the plugin root. Common settings:
- `writer.baseURL` - OpenAI-compatible API base URL
- `writer.apiKeyEnv` - Environment variable name for the API key
- `writer.model` - Model name to use for checkpoint writing
- `storage.maxInjectedChars` - Maximum characters to inject into context
