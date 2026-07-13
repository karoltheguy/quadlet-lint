#!/usr/bin/env node
/**
 * Extract per-section key data from the vendored Podman Quadlet man page and
 * emit `src/generated/keys.ts`.
 *
 * Run with: `npm run gen:keys`
 *
 * Two facts are pulled per section:
 *   - `valid`:       every key documented for the section (the "Valid options
 *                    for [X]" table, unioned with any detailed key headers).
 *   - `singleValue`: keys we can prove are single-valued — i.e. they have a
 *                    detailed description block that does NOT say the key may be
 *                    repeated. Keys without a detailed block are left OUT (their
 *                    repeatability is unknown, so we must not flag duplicates).
 *
 * This conservative rule is what preserves the linter's "zero false errors"
 * promise: a key we can't prove is single-valued is simply never flagged.
 *
 * The output is committed so the runtime stays dependency-free; re-run this
 * whenever the vendored doc is updated.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DOC = join(ROOT, "References", "podman-systemd.unit.5.md");
const OUT = join(ROOT, "src", "generated", "keys.ts");

// Canonical upstream source of the vendored doc. Refresh References/ from here,
// then re-run this script. Recorded in the generated file for provenance.
const UPSTREAM = "https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html";

// The nine Quadlet-specific sections. Order here defines output order.
const QUADLET_SECTIONS = [
  "Container", "Pod", "Kube", "Network", "Volume",
  "Build", "Image", "Artifact", "Quadlet",
];

/** A line that opens a "Valid options for `[X]` are listed below:" table. */
const VALID_MARKER = /^Valid options for `\[(\w+)\]` are listed below:/;
/** A line that opens a detailed "... `[X]` section are:" description block. */
const DETAIL_MARKER = /^(?:Description of|Supported keys in).*`\[(\w+)\]`.*section are:/;
/** A key row inside a "Valid options" table, e.g. `PublishPort=8080:80`. */
const TABLE_KEY = /^([A-Z][A-Za-z0-9]+)=/;
/** A key header inside a detailed block, e.g. `` `PublishPort=` ``. */
const DETAIL_KEY = /^`([A-Za-z0-9]+)=`/;
/** Wording that marks a key as repeatable (list/append semantics). */
const REPEATABLE = /(?:listed|used|specified|set)\s+(?:multiple times|more than once|several times)|multiple times|more than once/i;

function main() {
  const lines = readFileSync(DOC, "utf8").split(/\r?\n/);

  // 1. Collect all block boundaries in document order.
  const boundaries = [];
  lines.forEach((line, idx) => {
    let m = VALID_MARKER.exec(line);
    if (m) return boundaries.push({ idx, kind: "valid", section: m[1] });
    m = DETAIL_MARKER.exec(line);
    if (m) return boundaries.push({ idx, kind: "detail", section: m[1] });
  });

  /** section -> { valid:Set, singleValue:Set } */
  const data = new Map(QUADLET_SECTIONS.map((s) => [s, { valid: new Set(), singleValue: new Set() }]));

  // 2. Each boundary owns the lines up to the next boundary.
  boundaries.forEach((b, i) => {
    const start = b.idx + 1;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].idx : lines.length;
    const region = lines.slice(start, end);
    const entry = data.get(b.section);
    if (!entry) throw new Error(`Doc names an unexpected section [${b.section}]`);

    if (b.kind === "valid") {
      for (const line of region) {
        const m = TABLE_KEY.exec(line);
        if (m) entry.valid.add(m[1]);
      }
    } else {
      // Split the detail region into per-key blocks and test each for repeat wording.
      let currentKey = null;
      let buf = [];
      const flush = () => {
        if (!currentKey) return;
        entry.valid.add(currentKey);
        if (!REPEATABLE.test(buf.join("\n"))) entry.singleValue.add(currentKey);
      };
      for (const line of region) {
        const m = DETAIL_KEY.exec(line);
        if (m) {
          flush();
          currentKey = m[1];
          buf = [];
        } else if (currentKey) {
          buf.push(line);
        }
      }
      flush();
    }
  });

  // 3. Emit TypeScript.
  const today = new Date().toISOString().slice(0, 10);
  const body = QUADLET_SECTIONS.map((section) => {
    const { valid, singleValue } = data.get(section);
    return `  ${section}: {\n` +
      `    valid: new Set([${fmt([...valid])}]),\n` +
      `    singleValue: new Set([${fmt([...singleValue])}]),\n` +
      `  },`;
  }).join("\n");

  const out = `// AUTO-GENERATED — do not edit by hand.
// Source: References/podman-systemd.unit.5.md
// Upstream: ${UPSTREAM}
// Regenerate with: npm run gen:keys (after refreshing References/ from upstream)
// Generated: ${today}

export interface SectionKeys {
  /** Every key documented as valid in this section. */
  valid: ReadonlySet<string>;
  /** Keys proven single-valued (a duplicate is a mistake). Keys of unknown
   *  repeatability are intentionally omitted so they are never flagged. */
  singleValue: ReadonlySet<string>;
}

/** Key data for the Quadlet-specific sections, keyed by section name. */
export const SECTION_KEYS: Readonly<Record<string, SectionKeys>> = {
${body}
};
`;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, out);

  // Console summary for the human running the script.
  console.log(`Wrote ${OUT}`);
  for (const section of QUADLET_SECTIONS) {
    const { valid, singleValue } = data.get(section);
    console.log(`  [${section}] ${valid.size} keys, ${singleValue.size} single-valued`);
  }
}

/** Quote a list of identifiers as TS string literals. */
function fmt(items) {
  return items.map((s) => JSON.stringify(s)).join(", ");
}

main();
