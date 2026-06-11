import { readMemory, listMemoryFiles } from "../storage/memory-files.js";

export interface SearchResult {
  id: string;
  scope: string;
  title: string;
  body: string;
  type: string;
  score: number;
}

export function searchMemory(query: string, projectId: string | undefined, limit: number = 10): SearchResult[] {
  return searchPlainText(query, projectId, limit);
}

function searchPlainText(query: string, projectId: string | undefined, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();
  const terms = queryLower.split(/\s+/).filter(Boolean);

  const files = listMemoryFiles(projectId);
  for (const file of files) {
    const content = readMemory(file.scope, file.projectId, file.name);
    if (!content) continue;

    const contentLower = content.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const matches = contentLower.split(term).length - 1;
      score += matches;
    }

    if (score > 0) {
      results.push({
        id: file.path,
        scope: file.scope,
        title: file.name,
        body: content.slice(0, 500),
        type: "memory-file",
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function getMemoryContext(projectId: string, maxChars: number): string {
  const globalMemory = readMemory("global", undefined, "MEMORY.md");
  const projectMemory = readMemory("project", projectId, "MEMORY.md");
  const checkpoint = readMemory("project", projectId, "checkpoint.md");
  const notes = readMemory("project", projectId, "notes.md");

  const sections: string[] = [];

  if (projectMemory.trim()) {
    sections.push(`## Current Project Memory\n${projectMemory.trim()}`);
  }
  if (checkpoint.trim()) {
    sections.push(`## Current Session Checkpoint\n${checkpoint.trim()}`);
  }
  if (globalMemory.trim()) {
    sections.push(`## Global Memory\n${globalMemory.trim()}`);
  }
  if (notes.trim()) {
    sections.push(`## Notes\n${notes.trim()}`);
  }

  let combined = sections.join("\n\n");
  if (combined.length > maxChars) {
    combined = combined.slice(0, maxChars) + "\n...[truncated for budget]";
  }

  return combined;
}
