import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli/entry.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  outDir: "dist",
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
});
