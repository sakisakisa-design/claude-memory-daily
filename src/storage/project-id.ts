import { execSync } from "node:child_process";
import { sha256 } from "../utils/index.js";

export interface ProjectInfo {
  projectId: string;
  alias: string;
  repoRoot: string | null;
  branch: string | null;
}

function tryExec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

export function resolveProjectId(cwd: string): ProjectInfo {
  const repoRoot = tryExec("git rev-parse --show-toplevel", cwd);
  const branch = tryExec("git rev-parse --abbrev-ref HEAD", cwd);

  if (repoRoot) {
    const remoteUrl = tryExec("git remote get-url origin", cwd);
    const idSource = remoteUrl ? `git:${remoteUrl}:${repoRoot}` : `path:${repoRoot}`;
    const projectId = sha256(idSource);
    const alias = remoteUrl
      ? remoteUrl.replace(/.*[/:]/, "").replace(/\.git$/, "")
      : repoRoot.split("/").pop() || "unknown";
    return { projectId, alias, repoRoot, branch };
  }

  const projectId = sha256(`cwd:${cwd}`);
  const alias = cwd.split("/").pop() || "unknown";
  return { projectId, alias, repoRoot: null, branch: null };
}
