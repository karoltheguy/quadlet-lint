import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This test pins the marketplace/packaging metadata the VS Code extension
// manifest must carry before it can be published, plus the root-level
// packaging script that drives it. It reads raw JSON (not compiled output)
// so failures read as "the metadata is missing" rather than an unrelated
// import crash.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vscodeDir = path.resolve(__dirname, "../extensions/vscode");
const manifestPath = path.join(vscodeDir, "package.json");
const rootManifestPath = path.resolve(__dirname, "../package.json");

function readJson(p: string): any {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

describe("vscode extension manifest packaging metadata", () => {
  it("declares the publisher as karoltheguy", () => {
    const manifest = readJson(manifestPath);
    expect(manifest.publisher).toBe("karoltheguy");
  });

  it("declares a non-empty displayName", () => {
    const manifest = readJson(manifestPath);
    expect(typeof manifest.displayName).toBe("string");
    expect(manifest.displayName.length).toBeGreaterThan(0);
  });

  it("declares a non-empty description", () => {
    const manifest = readJson(manifestPath);
    expect(typeof manifest.description).toBe("string");
    expect(manifest.description.length).toBeGreaterThan(0);
  });

  it("declares a repository pointing at github.com/karoltheguy/quadlet-lint", () => {
    const manifest = readJson(manifestPath);
    expect(manifest.repository).toBeDefined();
    expect(manifest.repository.type).toBe("git");
    expect(typeof manifest.repository.url).toBe("string");
    expect(manifest.repository.url).toContain("github.com/karoltheguy/quadlet-lint");
  });

  it("declares MIT license, matching the root package", () => {
    const manifest = readJson(manifestPath);
    expect(manifest.license).toBe("MIT");
  });

  it("declares non-empty categories including Linters and Programming Languages", () => {
    const manifest = readJson(manifestPath);
    expect(Array.isArray(manifest.categories)).toBe(true);
    expect(manifest.categories.length).toBeGreaterThan(0);
    expect(manifest.categories).toContain("Linters");
    expect(manifest.categories).toContain("Programming Languages");
  });

  it("has a valid semver version", () => {
    const manifest = readJson(manifestPath);
    expect(typeof manifest.version).toBe("string");
    expect(manifest.version).toMatch(SEMVER_RE);
  });
});

describe("root package.json packaging entry point", () => {
  it("declares a non-empty package:vscode script", () => {
    const root = readJson(rootManifestPath);
    expect(typeof root?.scripts?.["package:vscode"]).toBe("string");
    expect(root.scripts["package:vscode"].length).toBeGreaterThan(0);
  });
});
