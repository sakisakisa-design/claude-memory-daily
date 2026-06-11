import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "index": "src/index.ts",
    "cli/index": "src/cli/index.ts",
    "hooks/hook-runner": "src/hooks/hook-runner.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  target: "node18",
  outDir: "dist",
  shims: false,
  banner: {
    js: "",
  },
});
