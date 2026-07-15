import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.cjs",
  format: "cjs",
  platform: "node",
  bundle: true,
  external: ["vscode"],
  sourcemap: true,
});
