import { describe, it, expect } from "vitest";
import { resolveProjectId } from "./project-id.js";

describe("project-id", () => {
  it("resolves project ID for git repos", () => {
    const result = resolveProjectId(process.cwd());
    expect(result.projectId).toBeTruthy();
    expect(result.projectId.length).toBe(16);
    expect(result.alias).toBeTruthy();
  });

  it("returns consistent IDs for same directory", () => {
    const r1 = resolveProjectId("/tmp");
    const r2 = resolveProjectId("/tmp");
    expect(r1.projectId).toBe(r2.projectId);
  });

  it("returns different IDs for different directories", () => {
    const r1 = resolveProjectId("/tmp");
    const r2 = resolveProjectId("/var");
    expect(r1.projectId).not.toBe(r2.projectId);
  });

  it("includes branch info when in a git repo", () => {
    const result = resolveProjectId(process.cwd());
    if (result.repoRoot) {
      expect(result.branch).toBeTruthy();
    }
  });
});
