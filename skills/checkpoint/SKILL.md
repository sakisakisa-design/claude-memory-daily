---
name: checkpoint
description: Write a checkpoint now or show the current checkpoint
---

Use the skill base directory shown by Claude to run the bundled CLI, avoiding PATH-dependent `cmh` lookups:

```bash
cd "<skill base directory>/../.." && node dist/cli/index.js checkpoint now
```

Trigger an immediate checkpoint write using the configured writer model. Use `--dry-run` first if the user wants to preview. Use `node dist/cli/index.js checkpoint show` from the plugin root to display the current checkpoint content.
