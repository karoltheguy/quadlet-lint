import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    monaco: "src/monaco.ts",
    service: "src/service.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  // monaco-editor is an optional peer; never bundle it into the adapter.
  external: ["monaco-editor"],
});
