---
name: status
description: Show Claude Memory Harness status, config, and memory state
---

Use the skill base directory shown by Claude to run the bundled CLI, avoiding PATH-dependent `cmh` lookups:

```bash
cd "<skill base directory>/../.." && node dist/cli/index.js status && node dist/cli/index.js doctor
```

Show the current status of Claude Memory Harness including config, writer, project info, and memory file sizes, then show health checks.
