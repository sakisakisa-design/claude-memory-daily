import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getDataDir } from "../config/index.js";

export type MemoryScope = "global" | "project";

export interface MemoryFile {
  scope: MemoryScope;
  projectId?: string;
  name: string;
  path: string;
}

function globalDir(): string {
  return join(getDataDir(), "memories", "global");
}

function projectDir(projectId: string): string {
  return join(getDataDir(), "memories", "projects", projectId);
}

export function getMemoryPath(scope: MemoryScope, projectId: string | undefined, name: string): string {
  if (scope === "global") {
    return join(globalDir(), name);
  }
  return join(projectDir(projectId!), name);
}

export function readMemory(scope: MemoryScope, projectId: string | undefined, name: string): string {
  const path = getMemoryPath(scope, projectId, name);
  if (!existsSync(path)) return "";
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

export function writeMemory(
  scope: MemoryScope,
  projectId: string | undefined,
  name: string,
  content: string
): void {
  const path = getMemoryPath(scope, projectId, name);
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    copyFileSync(path, path + ".bak");
  }
  writeFileSync(path, content, "utf-8");
}

export function appendMemory(
  scope: MemoryScope,
  projectId: string | undefined,
  name: string,
  content: string
): void {
  const existing = readMemory(scope, projectId, name);
  const updated = existing ? existing + "\n" + content : content;
  writeMemory(scope, projectId, name, updated);
}

export function listMemoryFiles(projectId?: string): MemoryFile[] {
  const files: MemoryFile[] = [];

  if (existsSync(globalDir())) {
    for (const name of ["MEMORY.md", "notes.md"]) {
      const path = join(globalDir(), name);
      if (existsSync(path)) {
        files.push({ scope: "global", name, path });
      }
    }
  }

  if (projectId) {
    const pdir = projectDir(projectId);
    if (existsSync(pdir)) {
      for (const name of ["MEMORY.md", "checkpoint.md", "notes.md", "handoff.md"]) {
        const path = join(pdir, name);
        if (existsSync(path)) {
          files.push({ scope: "project", projectId, name, path });
        }
      }
    }
  }

  return files;
}
