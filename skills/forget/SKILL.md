---
name: forget
description: Forget specific memories (project, global, or checkpoint)
---

Ask the user what they want to forget:
- Project memory: from the plugin root, run `node dist/cli/index.js forget project --confirm`
- Global memory: from the plugin root, run `node dist/cli/index.js forget global --confirm`
- Checkpoint: from the plugin root, run `node dist/cli/index.js forget checkpoint --confirm`

Always confirm with the user before running with `--confirm`. Without `--confirm`, the command will only show what would be deleted.

Use the skill base directory shown by Claude to find the plugin root:

```bash
cd "<skill base directory>/../.."
```
