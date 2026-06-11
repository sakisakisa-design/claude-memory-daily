import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolvePackageRoot } from "./install.js";

describe("install command", () => {
  it("resolves the package root from the module URL", () => {
    const root = resolvePackageRoot(import.meta.url);

    expect(existsSync(join(root, "package.json"))).toBe(true);
    expect(existsSync(join(root, "hooks"))).toBe(true);
  });
});
