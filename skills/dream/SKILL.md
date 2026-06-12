---
name: dream
description: Consolidate and clean up memory (dream mode)
---

Use the skill base directory shown by Claude to run the bundled CLI, avoiding PATH-dependent `cmh` lookups:

```bash
cd "<skill base directory>/../.." && node dist/cli/index.js dream --dry-run
```

Show what the dream consolidation would do. Then ask the user if they want to apply the changes. If confirmed, run `node dist/cli/index.js dream --apply` from the plugin root. Explain what was consolidated and any warnings.
