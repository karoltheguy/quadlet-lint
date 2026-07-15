#!/usr/bin/env node
/**
 * Extract per-section key data from the live Podman Quadlet man page HTML
 * and emit `src/generated/keys.ts`.
 *
 * Run with: `npm run gen:keys`
 *
 * This script fetches the documentation HTML directly from docs.podman.io,
 * parsing it to extract valid keys, single-valued/repeatable statuses,
 * and description paragraphs. This eliminates any manual copy or conversion steps.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "src", "generated", "keys.ts");

const UPSTREAM = "https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html";

export const QUADLET_SECTIONS = [
  "Container", "Pod", "Kube", "Network", "Volume",
  "Build", "Image", "Artifact", "Quadlet",
];

const REPEATABLE = /(?:listed|used|specified|set)\s+(?:multiple times|more than once|several times)|multiple times|more than once/i;

export function cleanText(html) {
  return html
    // Convert code blocks / pre / span code structures with backticks
    .replace(/<code[^>]*><span[^>]*>([\s\S]*?)<\/span><\/code>/gi, '`$1`')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8216;/g, "'")
    .replace(/&#8230;/g, '...')
    .replace(/\s+/g, " ")
    .trim();
}

export function parseHtml(html) {
  const data = new Map(QUADLET_SECTIONS.map((s) => [s, { valid: new Set(), singleValue: new Set(), descriptions: new Map() }]));

  // 1. Locate boundaries using <h1> headings like "<h1>Build units [Build]"
  const headingRegex = /<h1>.*?\[(\w+)\]/gi;
  const boundaries = [];
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const section = match[1];
    if (QUADLET_SECTIONS.includes(section)) {
      boundaries.push({ index: match.index, section });
    }
  }

  // Add the boundary for EXAMPLES or end of file to stop parsing the last section
  const examplesMatch = /<section id="examples">/i.exec(html) || /<h1>EXAMPLES/i.exec(html);
  const endOfDetailsIndex = examplesMatch ? examplesMatch.index : html.length;
  boundaries.push({ index: endOfDetailsIndex, section: "END" });

  // Sort boundaries by index
  boundaries.sort((a, b) => a.index - b.index);

  // Parse each section region
  for (let i = 0; i < boundaries.length - 1; i++) {
    const b = boundaries[i];
    const nextB = boundaries[i + 1];
    const section = b.section;
    const entry = data.get(section);
    if (!entry) continue;

    const region = html.substring(b.index, nextB.index);

    // A. Parse valid keys from the table in this region (if present)
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    if ((tableMatch = tableRegex.exec(region)) !== null) {
      const tableBody = tableMatch[1];
      const keyRegex = /<td><p>([A-Za-z0-9]+)=/gi;
      let keyMatch;
      while ((keyMatch = keyRegex.exec(tableBody)) !== null) {
        entry.valid.add(keyMatch[1]);
      }
    }

    // B. Parse detailed keys in this region
    const keyHeadingRegex = /<h2><code[^>]*><span[^>]*>([A-Za-z0-9]+)=<\/span><\/code>/gi;
    const keyBoundaries = [];
    let keyMatch;
    while ((keyMatch = keyHeadingRegex.exec(region)) !== null) {
      keyBoundaries.push({ index: keyMatch.index, key: keyMatch[1] });
    }
    keyBoundaries.push({ index: region.length, key: "END" });

    for (let j = 0; j < keyBoundaries.length - 1; j++) {
      const kb = keyBoundaries[j];
      const nextKb = keyBoundaries[j + 1];
      const key = kb.key;
      const keyRegion = region.substring(kb.index, nextKb.index);

      // Add to valid
      entry.valid.add(key);

      // Extract first paragraph after the h2 tag for description
      const pMatch = /<p>([\s\S]*?)<\/p>/i.exec(keyRegion.substring(keyRegion.indexOf("</h2>")));
      if (pMatch) {
        const descText = cleanText(pMatch[1]);
        if (descText) {
          entry.descriptions.set(key, descText);
        }
      }

      // Check repeatability
      const cleanRegionText = cleanText(keyRegion);
      if (!REPEATABLE.test(cleanRegionText)) {
        entry.singleValue.add(key);
      }
    }
  }

  return data;
}

export async function main() {
  console.log(`Fetching upstream reference: ${UPSTREAM}`);
  const res = await fetch(UPSTREAM);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${UPSTREAM}: ${res.statusText}`);
  }
  const html = await res.text();
  const data = parseHtml(html);

  // 3. Emit TypeScript.
  const today = new Date().toISOString().slice(0, 10);
  const body = QUADLET_SECTIONS.map((section) => {
    const { valid, singleValue, descriptions } = data.get(section);
    return `  ${section}: {\n` +
      `    valid: new Set([${fmt([...valid])}]),\n` +
      `    singleValue: new Set([${fmt([...singleValue])}]),\n` +
      `    descriptions: {\n${fmtDescriptions(descriptions)}\n    },\n` +
      `  },`;
  }).join("\n");

  const out = `// AUTO-GENERATED — do not edit by hand.
// Source: ${UPSTREAM}
// Regenerate with: npm run gen:keys
// Generated: ${today}

export interface SectionKeys {
  /** Every key documented as valid in this section. */
  valid: ReadonlySet<string>;
  /** Keys proven single-valued (a duplicate is a mistake). Keys of unknown
   *  repeatability are intentionally omitted so they are never flagged. */
  singleValue: ReadonlySet<string>;
  /** First doc paragraph per key, for hover. Keys documented only in the
   *  "Valid options" table have no entry. */
  descriptions: Readonly<Record<string, string>>;
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
    const { valid, singleValue, descriptions } = data.get(section);
    console.log(`  [${section}] ${valid.size} keys, ${singleValue.size} single-valued, ${descriptions.size} described`);
  }
}

/** Quote a list of identifiers as TS string literals. */
export function fmt(items) {
  return items.map((s) => JSON.stringify(s)).join(", ");
}

/** Emit a descriptions map as `"Key": "text",` lines. */
export function fmtDescriptions(map) {
  return [...map.entries()]
    .map(([k, v]) => `      ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n");
}

// Run main if this file is the main entry point
const nodePath = process.argv[1];
if (nodePath && (nodePath === fileURLToPath(import.meta.url) || nodePath.endsWith("extract-keys.mjs"))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
