---
name: search
description: Search memory for relevant context
---

Use the skill base directory shown by Claude to run the bundled CLI, avoiding PATH-dependent `cmh` lookups:

```bash
cd "<skill base directory>/../.." && node dist/cli/index.js memory search "<user query>"
```

Search the local memory database. Display the results with their scope, type, and relevance score. If no results are found, tell the user that no relevant memories exist yet.
