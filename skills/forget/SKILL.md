---
name: forget
description: Forget specific memories (project, global, or checkpoint)
---

Ask the user what they want to forget:
- Project memory: run `cmh forget project --confirm`
- Global memory: run `cmh forget global --confirm`
- Checkpoint: run `cmh forget checkpoint --confirm`

Always confirm with the user before running with `--confirm`. Without `--confirm`, the command will only show what would be deleted.
