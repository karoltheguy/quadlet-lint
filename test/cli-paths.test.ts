import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectQuadletFiles, parseArgs, runLintPaths } from "../src/cli.js";

// `chmod 000` does not restrict root, so any test relying on a directory
// actually being unreadable would pass vacuously as root. Skip those tests
// explicitly rather than let them silently pass for the wrong reason.
const isRoot = process.getuid?.() === 0;

describe("collectQuadletFiles and runLintPaths (not implemented yet)", () => {
  let dir: string;
  // Directories that a test has chmod'd to 0o000. Restored before rmSync
  // runs in afterEach, otherwise the recursive rmSync would fail and poison
  // every later test in this file.
  let lockedDirs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "quadlet-lint-test-"));
    lockedDirs = [];
  });

  afterEach(() => {
    for (const lockedDir of lockedDirs) {
      try {
        chmodSync(lockedDir, 0o755);
      } catch {
        // Directory may not exist if the test already cleaned it up; that's fine.
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  describe("collectQuadletFiles", () => {
    it("returns an explicit file path as-is even if it is not Quadlet-shaped", () => {
      const file = join(dir, "foo.txt");
      writeFileSync(file, "hello\n");
      const result = collectQuadletFiles([file]);
      expect(result).toEqual([file]);
    });

    it("returns an explicit Quadlet file path", () => {
      const file = join(dir, "web.container");
      writeFileSync(file, "[Container]\nImage=nginx\n");
      const result = collectQuadletFiles([file]);
      expect(result).toEqual([file]);
    });

    it("returns only Quadlet files from a directory, ignoring non-Quadlet files", () => {
      const webFile = join(dir, "web.container");
      const dbFile = join(dir, "db.volume");
      writeFileSync(webFile, "[Container]\nImage=nginx\n");
      writeFileSync(dbFile, "[Volume]\n");
      writeFileSync(join(dir, "README.md"), "readme\n");
      writeFileSync(join(dir, "notes.txt"), "notes\n");

      const result = collectQuadletFiles([dir]);
      expect(result).toEqual([webFile, dbFile].sort());
    });

    it("recurses into nested subdirectories", () => {
      const nested = join(dir, "nested", "deeper");
      mkdirSync(nested, { recursive: true });
      const nestedFile = join(nested, "app.pod");
      writeFileSync(nestedFile, "[Pod]\n");

      const result = collectQuadletFiles([dir]);
      expect(result).toEqual([nestedFile]);
    });

    it("returns a drop-in .conf file under a <type>.d directory", () => {
      const dropinDir = join(dir, "web.container.d");
      mkdirSync(dropinDir, { recursive: true });
      const dropinFile = join(dropinDir, "10-override.conf");
      writeFileSync(dropinFile, "[Container]\nPublishPort=8080:80\n");

      const result = collectQuadletFiles([dir]);
      expect(result).toEqual([dropinFile]);
    });

    it("does not return a bare .conf file not under a <type>.d directory", () => {
      writeFileSync(join(dir, "random.conf"), "not a dropin\n");

      const result = collectQuadletFiles([dir]);
      expect(result).toEqual([]);
    });

    it("is case-sensitive: an uppercase extension is not recognized", () => {
      writeFileSync(join(dir, "WEB.CONTAINER"), "[Container]\nImage=nginx\n");

      const result = collectQuadletFiles([dir]);
      expect(result).toEqual([]);
    });

    it("returns results in sorted, deterministic order", () => {
      const zFile = join(dir, "zeta.container");
      const aFile = join(dir, "alpha.container");
      writeFileSync(zFile, "[Container]\nImage=nginx\n");
      writeFileSync(aFile, "[Container]\nImage=nginx\n");

      const result = collectQuadletFiles([dir]);
      expect(result).toEqual([...result].sort());
      expect(result).toEqual([aFile, zFile]);
    });

    it("de-duplicates the same explicit file path passed twice", () => {
      const file = join(dir, "web.container");
      writeFileSync(file, "[Container]\nImage=nginx\n");

      const result = collectQuadletFiles([file, file]);
      expect(result).toEqual([file]);
    });

    it("combines an explicit file argument and a directory argument", () => {
      const otherDir = mkdtempSync(join(tmpdir(), "quadlet-lint-test-other-"));
      try {
        const explicitFile = join(otherDir, "standalone.network");
        writeFileSync(explicitFile, "[Network]\n");

        const dirFile = join(dir, "web.container");
        writeFileSync(dirFile, "[Container]\nImage=nginx\n");

        const result = collectQuadletFiles([explicitFile, dir]);
        expect(result).toEqual([dirFile, explicitFile].sort());
      } finally {
        rmSync(otherDir, { recursive: true, force: true });
      }
    });

    it("does not descend into a symlinked directory pointing back at its own parent (no hang, no duplicates)", () => {
      const subDir = join(dir, "sub");
      mkdirSync(subDir, { recursive: true });
      const realFile = join(subDir, "web.container");
      writeFileSync(realFile, "[Container]\nImage=nginx\n");

      const linkPath = join(subDir, "loop");
      try {
        symlinkSync(dir, linkPath, "dir");
      } catch (err) {
        throw new Error(
          `symlinkSync unavailable in this environment, cannot exercise symlink safety case: ${
            (err as Error).message
          }`,
        );
      }

      const result = collectQuadletFiles([dir]);
      expect(result).toEqual([realFile]);
    });

    it.skipIf(isRoot)(
      "does not throw on an unreadable subdirectory, still returns the readable file, and surfaces the unreadable directory's own path",
      () => {
        const lockedDir = join(dir, "locked");
        mkdirSync(lockedDir, { recursive: true });
        const readableFile = join(dir, "web.container");
        writeFileSync(readableFile, "[Container]\nImage=nginx\n");

        try {
          chmodSync(lockedDir, 0o000);
          lockedDirs.push(lockedDir);

          let result: string[] = [];
          expect(() => {
            result = collectQuadletFiles([dir]);
          }).not.toThrow();

          expect(result).toContain(readableFile);
          expect(result).toContain(lockedDir);
        } finally {
          chmodSync(lockedDir, 0o755);
        }
      },
    );
  });

  describe("runLintPaths", () => {
    it("exits 0 with empty output for two clean Quadlet files", () => {
      const file1 = join(dir, "a.container");
      const file2 = join(dir, "b.container");
      writeFileSync(file1, "[Container]\nImage=nginx\n");
      writeFileSync(file2, "[Container]\nImage=nginx\n");

      const r = runLintPaths([file1, file2]);
      expect(r.exitCode).toBe(0);
      expect(r.output).toBe("");
    });

    it("exits 1 and reports the offending file's name when one file has a hard error", () => {
      const goodFile = join(dir, "good.container");
      const badFile = join(dir, "bad.container");
      writeFileSync(goodFile, "[Container]\nImage=nginx\n");
      writeFileSync(badFile, "notaline\n");

      const r = runLintPaths([goodFile, badFile]);
      expect(r.exitCode).toBe(1);
      expect(r.output.includes(badFile)).toBe(true);
    });

    it("exits 0 but produces non-empty output for warnings only", () => {
      // A complete, valid unit whose only problem is a QL040 enum warning.
      // The file has to be a real complete unit: it is named `.container`, so
      // omitting [Container] or Image= would trip the fileName-gated QL050 /
      // QL060 errors and this would stop testing the warnings-only path.
      const file = join(dir, "app.container");
      writeFileSync(file, "[Container]\nImage=nginx\nPull=sometimes\n");

      const r = runLintPaths([file]);
      expect(r.exitCode).toBe(0);
      expect(r.output.includes("QL040")).toBe(true);
    });

    it("exits 2 and mentions the missing path in errorOutput", () => {
      const missing = join(dir, "does-not-exist.container");

      const r = runLintPaths([missing]);
      expect(r.exitCode).toBe(2);
      expect(r.errorOutput.includes(missing)).toBe(true);
    });

    it("still lints a real file with an error alongside a missing path, and exits 2", () => {
      const missing = join(dir, "does-not-exist.container");
      const badFile = join(dir, "bad.container");
      writeFileSync(badFile, "notaline\n");

      const r = runLintPaths([missing, badFile]);
      expect(r.exitCode).toBe(2);
      expect(r.errorOutput.includes(missing)).toBe(true);
      expect(r.output.includes(badFile)).toBe(true);
    });

    it("integration: lints a directory's .container file under its own real fileName, producing QL050", () => {
      const file = join(dir, "web.container");
      writeFileSync(file, "[Unit]\nDescription=test\n");

      const paths = collectQuadletFiles([dir]);
      const r = runLintPaths(paths);
      expect(r.output.includes(file)).toBe(true);
      expect(r.output.includes("QL050")).toBe(true);
    });

    it("integration: a drop-in .conf file overriding only some keys produces no QL050 or QL060", () => {
      const dropinDir = join(dir, "web.container.d");
      mkdirSync(dropinDir, { recursive: true });
      const dropinFile = join(dropinDir, "10-override.conf");
      writeFileSync(dropinFile, "[Container]\nPublishPort=8080:80\n");

      const paths = collectQuadletFiles([dir]);
      // Pin down that the drop-in was actually collected and linted. Without
      // this, a walk that silently skipped it would lint nothing at all and
      // the absence assertions below would pass vacuously.
      expect(paths).toContain(dropinFile);

      const r = runLintPaths(paths);
      expect(r.output.includes("QL050")).toBe(false);
      expect(r.output.includes("QL060")).toBe(false);
    });

    it.skipIf(isRoot)(
      "exits 2 and mentions the unreadable directory in errorOutput while still linting the readable file",
      () => {
        const lockedDir = join(dir, "locked");
        mkdirSync(lockedDir, { recursive: true });
        const readableFile = join(dir, "web.container");
        writeFileSync(readableFile, "[Container]\nImage=nginx\nPull=sometimes\n");

        try {
          chmodSync(lockedDir, 0o000);
          lockedDirs.push(lockedDir);

          const paths = collectQuadletFiles([dir]);
          const r = runLintPaths(paths);

          expect(r.exitCode).toBe(2);
          expect(r.errorOutput.includes(lockedDir)).toBe(true);
          expect(r.output.includes(readableFile)).toBe(true);
          expect(r.output.includes("QL040")).toBe(true);
        } finally {
          chmodSync(lockedDir, 0o755);
        }
      },
    );
  });

  describe("runLintPaths JSON format", () => {
    it("emits a flat array of diagnostics, each tagged with its file", () => {
      const file = join(dir, "web.container");
      writeFileSync(file, "[Container]\nImage=nginx\nPull=sometimes\n");

      const r = runLintPaths([file], { format: "json" });
      const parsed = JSON.parse(r.output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);

      const ql040 = parsed.find((d: { code: string }) => d.code === "QL040");
      expect(ql040).toMatchObject({
        file,
        severity: "warning",
        code: "QL040",
      });
      expect(typeof ql040.line).toBe("number");
      expect(typeof ql040.startColumn).toBe("number");
      expect(typeof ql040.endColumn).toBe("number");
      expect(typeof ql040.message).toBe("string");
    });

    it("flattens diagnostics from multiple files into one array", () => {
      const a = join(dir, "a.container");
      const b = join(dir, "b.container");
      writeFileSync(a, "notaline\n");
      writeFileSync(b, "notaline\n");

      const r = runLintPaths([a, b], { format: "json" });
      const parsed = JSON.parse(r.output);
      const files = new Set(parsed.map((d: { file: string }) => d.file));
      expect(files).toEqual(new Set([a, b]));
      expect(r.exitCode).toBe(1);
    });

    it("emits an empty array (not an empty string) for a clean run", () => {
      const file = join(dir, "clean.container");
      writeFileSync(file, "[Container]\nImage=nginx\n");

      const r = runLintPaths([file], { format: "json" });
      expect(r.output).toBe("[]");
      expect(JSON.parse(r.output)).toEqual([]);
      expect(r.exitCode).toBe(0);
    });

    it("still reports unreadable paths on stderr and exits 2 in JSON mode", () => {
      const missing = join(dir, "does-not-exist.container");

      const r = runLintPaths([missing], { format: "json" });
      expect(r.exitCode).toBe(2);
      expect(r.errorOutput.includes(missing)).toBe(true);
      expect(r.output).toBe("[]");
    });
  });

  describe("runLintPaths text color", () => {
    it("leaves output byte-identical to the default when color is off", () => {
      const file = join(dir, "web.container");
      writeFileSync(file, "notaline\n");

      const plain = runLintPaths([file]);
      const explicit = runLintPaths([file], { format: "text", color: false });
      expect(explicit.output).toBe(plain.output);
      expect(plain.output.includes("\x1b[")).toBe(false);
    });

    it("colorizes the severity token when color is on", () => {
      const file = join(dir, "web.container");
      writeFileSync(file, "notaline\n");

      const r = runLintPaths([file], { color: true });
      // Red for the error severity, and the rest of the line intact.
      expect(r.output.includes("\x1b[31merror\x1b[0m")).toBe(true);
      expect(r.output.includes("QL001")).toBe(true);
      expect(r.output.includes(file)).toBe(true);
    });
  });

  describe("parseArgs", () => {
    it("defaults to text format and collects bare paths", () => {
      expect(parseArgs(["web.container", "db.volume"])).toEqual({
        paths: ["web.container", "db.volume"],
        format: "text",
      });
    });

    it("parses --format json with a separate value", () => {
      expect(parseArgs(["--format", "json", "web.container"])).toEqual({
        paths: ["web.container"],
        format: "json",
      });
    });

    it("parses the -f short flag", () => {
      expect(parseArgs(["-f", "json", "web.container"])).toEqual({
        paths: ["web.container"],
        format: "json",
      });
    });

    it("parses the --format=json joined form", () => {
      expect(parseArgs(["--format=json", "web.container"])).toEqual({
        paths: ["web.container"],
        format: "json",
      });
    });

    it("errors on an unknown format", () => {
      const r = parseArgs(["--format", "yaml", "web.container"]);
      expect("error" in r && r.error.includes("yaml")).toBe(true);
    });

    it("errors when --format has no value", () => {
      const r = parseArgs(["web.container", "--format"]);
      expect("error" in r && r.error.includes("requires an argument")).toBe(true);
    });

    it("errors when no paths are given", () => {
      const r = parseArgs(["--format", "json"]);
      expect("error" in r).toBe(true);
    });
  });
});
