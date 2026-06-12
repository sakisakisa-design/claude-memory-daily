import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildMarketplaceManifest, resolvePackageRoot } from "./install.js";

describe("install command", () => {
  it("resolves the package root from the module URL", () => {
    const root = resolvePackageRoot(import.meta.url);

    expect(existsSync(join(root, "package.json"))).toBe(true);
    expect(existsSync(join(root, "hooks"))).toBe(true);
  });

  it("builds a Claude Code marketplace manifest for the local plugin", () => {
    expect(buildMarketplaceManifest()).toEqual({
      $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
      name: "local-memory-harness",
      description: "Local marketplace for Claude Memory Harness",
      owner: {
        name: "Claude Memory Harness",
      },
      plugins: [
        {
          name: "claude-memory-harness",
          description: "Local memory harness for Claude Code",
          source: "./claude-memory-harness",
        },
      ],
    });
  });
});
