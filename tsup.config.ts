import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli/index.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
});
