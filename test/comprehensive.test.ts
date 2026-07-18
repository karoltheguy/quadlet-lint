import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lintQuadlet } from "../src/index.js";
import { buildUnitIndex } from "../src/unit-index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const validDir = path.resolve(__dirname, "valid");
const invalidDir = path.resolve(__dirname, "invalid");

function walkSync(dir: string): string[] {
  const results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results.push(...walkSync(filePath));
    } else {
      results.push(filePath);
    }
  }
  return results;
}

describe("comprehensive valid quadlets", () => {
  const validFiles = walkSync(validDir);
  const validUnitIndex = buildUnitIndex(validFiles);

  for (const file of validFiles) {
    const relativePath = path.relative(validDir, file);
    // Skip app.yaml as it is a YAML file, not a Quadlet unit file
    if (relativePath.endsWith(".yaml")) {
      continue;
    }

    it(`should produce no diagnostics for valid file: ${relativePath}`, () => {
      const text = fs.readFileSync(file, "utf8");
      const diagnostics = lintQuadlet(text, { fileName: file, unitIndex: validUnitIndex });
      expect(diagnostics).toEqual([]);
    });
  }
});

describe("comprehensive invalid quadlets", () => {
  const invalidFiles = walkSync(invalidDir);
  // Build a unit index containing all invalid files to test cross-unit references correctly
  const invalidUnitIndex = buildUnitIndex(invalidFiles);

  const expectedDiagnostics: Record<string, string[]> = {
    "syntax.container": ["QL001", "QL002", "QL060"],
    "unknowns.container": ["QL010", "QL030", "QL060"],
    "duplicate-keys.container": ["QL020"],
    "bad-enums.container": ["QL040"],
    "bad-ports.container": ["QL080"],
    "bad-hosts.container": ["QL081"],
    "bad-bytes.container": ["QL082"],
    "mismatch.container": ["QL050", "QL050"],
    "missing-section.network": ["QL050"],
    "missing-reqs.build": ["QL060", "QL060"],
    "missing-reqs.kube": ["QL060"],
    "missing-reqs.artifact": ["QL060"],
    "conditional-vol.volume": ["QL061"],
    "conditional-vol-dev.volume": ["QL061"],
    "conditional-ctr.container": ["QL061"],
    "conditional-net.network": ["QL061"],
    "conflicts.container": ["QL070"],
    "conflicts-reload.container": ["QL070"],
    "broken-refs.container": ["QL090", "QL090", "QL090"],
    "dropins/bad.container.d/20-error.conf": ["QL030"],
  };

  for (const file of invalidFiles) {
    const relativePath = path.relative(invalidDir, file);

    it(`should produce expected diagnostics for: ${relativePath}`, () => {
      const expectedCodes = expectedDiagnostics[relativePath];
      if (!expectedCodes) {
        throw new Error(`No expected diagnostics defined for test file: ${relativePath}`);
      }

      const text = fs.readFileSync(file, "utf8");
      const diagnostics = lintQuadlet(text, { fileName: file, unitIndex: invalidUnitIndex });
      const actualCodes = diagnostics.map((d) => d.code);

      // Verify actual codes match expected codes (ignoring order)
      expect(actualCodes.sort()).toEqual(expectedCodes.sort());
    });
  }
});
