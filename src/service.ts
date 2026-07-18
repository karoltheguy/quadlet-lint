/**
 * Editor-neutral service layer on top of the pure lint core. This module
 * defines plain-data types (no editor SDK dependency) so that different
 * editor adapters (Monaco, CodeMirror, LSP, …) can each translate to/from
 * their own coordinate systems without pulling in an editor at all.
 */

import { SECTION_RE, endsWithContinuation, Codes, type Diagnostic } from "./index.js";
import {
  hasKeyData,
  isKnownKey,
  getKeyDescription,
  getSectionKeys,
  getEnumValues,
  KNOWN_SECTIONS,
  FILE_TYPE_SECTIONS,
  expectedSectionFor,
} from "./sections.js";
import { findBestMatch } from "./levenshtein.js";
import {
  hasSystemdKeyData,
  isKnownSystemdKey,
  getSystemdSectionKeys,
  getSystemdKeyDescription,
} from "./systemd.js";

/**
 * A cursor/caret position. 1-based, matching {@link Diagnostic} in
 * src/index.ts: `line` is the 1-based line number, `column` is the 1-based
 * column of the character.
 */
export interface Position {
  line: number;
  column: number;
}

/** A single text edit, in the same 1-based coordinate system as {@link Diagnostic}. */
export interface TextEdit {
  line: number;
  startColumn: number;
  endColumn: number;
  newText: string;
}

/** A single completion suggestion. */
export interface CompletionItem {
  label: string;
  detail?: string;
  /** LSP/TextMate snippet body (e.g. `Image=$0`); when set, adapters insert it as a snippet instead of the plain label. */
  snippet?: string;
}

/** Hover information for the key under the cursor. */
export interface HoverInfo {
  section: string;
  key: string;
  description: string | null;
}

/**
 * Compute hover information for the key at `position` in `text`, or `null`
 * if the cursor is not on a recognized key.
 *
 * Mirrors the line-classification loop in `lintQuadlet` (src/index.ts) so
 * that hover agrees with the linter about sections, continuations, and
 * assignments, but only walks as far as the target line and returns a single
 * result instead of collecting diagnostics.
 */
export function getHover(text: string, position: Position): HoverInfo | null {
  const lines = text.split(/\r?\n/);
  if (position.line < 1 || position.line > lines.length) return null;

  const targetIndex = position.line - 1;

  let currentSection: string | null = null;
  let inContinuation = false;

  for (let i = 0; i <= targetIndex; i++) {
    const raw = lines[i]!;
    const isTarget = i === targetIndex;

    if (inContinuation) {
      inContinuation = endsWithContinuation(raw);
      if (isTarget) return null;
      continue;
    }

    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      if (isTarget) return null;
      continue;
    }

    const sectionMatch = SECTION_RE.exec(raw);
    if (sectionMatch) {
      currentSection = sectionMatch.groups!.name!;
      inContinuation = endsWithContinuation(raw);
      if (isTarget) return null;
      continue;
    }

    const eq = raw.indexOf("=");
    if (eq === -1) {
      inContinuation = endsWithContinuation(raw);
      if (isTarget) return null;
      continue;
    }

    if (isTarget) {
      if (currentSection === null) return null;

      const key = raw.slice(0, eq).trim();
      const keyStart = raw.length - raw.trimStart().length;
      if (key === "") return null;
      if (position.column < keyStart + 1 || position.column > keyStart + key.length + 1) {
        return null;
      }

      if (hasKeyData(currentSection)) {
        if (!isKnownKey(currentSection, key)) return null;
        return { section: currentSection, key, description: getKeyDescription(currentSection, key) };
      }

      if (hasSystemdKeyData(currentSection) && isKnownSystemdKey(currentSection, key)) {
        return {
          section: currentSection,
          key,
          description: getSystemdKeyDescription(currentSection, key),
        };
      }

      return null;
    }

    inContinuation = endsWithContinuation(raw);
  }

  return null;
}

/**
 * Compute completion suggestions at `position` in `text`. Depending on where
 * the cursor sits, this suggests one of three things:
 *
 *  - Section headers, when the cursor is on an empty line with no enclosing
 *    section yet, or right after an opened `[`. When `fileName` is given,
 *    sections tied to a different file type (see {@link FILE_TYPE_SECTIONS})
 *    are excluded.
 *  - Keys, when the cursor is inside a section we have authoritative key
 *    data for (see {@link hasKeyData}).
 *  - Enum values, when the cursor is after a key's `=` and that key has a
 *    curated closed-set of values (see {@link getEnumValues}).
 *
 * Returns `[]` on a continuation line, or when none of the above apply.
 */
export function getCompletions(
  text: string,
  position: Position,
  fileName?: string,
): CompletionItem[] {
  const lines = text.split(/\r?\n/);
  if (position.line < 1 || position.line > lines.length) return [];

  const targetIndex = position.line - 1;

  let currentSection: string | null = null;
  let inContinuation = false;

  for (let i = 0; i < targetIndex; i++) {
    const raw = lines[i]!;

    if (inContinuation) {
      inContinuation = endsWithContinuation(raw);
      continue;
    }

    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }

    const sectionMatch = SECTION_RE.exec(raw);
    if (sectionMatch) {
      currentSection = sectionMatch.groups!.name!;
      inContinuation = endsWithContinuation(raw);
      continue;
    }

    const eq = raw.indexOf("=");
    if (eq === -1) {
      inContinuation = endsWithContinuation(raw);
      continue;
    }

    inContinuation = endsWithContinuation(raw);
  }

  if (inContinuation) return [];

  const raw = lines[targetIndex] ?? "";
  const beforeCursor = raw.slice(0, position.column - 1);
  const trimmedBefore = beforeCursor.trim();

  if (trimmedBefore === "") {
    if (currentSection === null) return sectionCompletions(fileName, true);
    if (hasKeyData(currentSection)) return keyCompletions(currentSection);
    if (hasSystemdKeyData(currentSection)) return systemdKeyCompletions(currentSection);
    return [];
  }

  if (/^\[[^\]=]*$/.test(trimmedBefore)) {
    return sectionCompletions(fileName);
  }

  const eq = beforeCursor.indexOf("=");
  if (eq !== -1) {
    const key = beforeCursor.slice(0, eq).trim();
    if (currentSection === null) return [];
    const values = getEnumValues(currentSection, key);
    if (!values) return [];
    return [...values].map((label) => ({ label }));
  }

  if (currentSection !== null && hasKeyData(currentSection)) {
    return keyCompletions(currentSection);
  }

  if (currentSection !== null && hasSystemdKeyData(currentSection)) {
    return systemdKeyCompletions(currentSection);
  }

  return [];
}

/** Escapes TextMate/LSP snippet metacharacters. Keys are simple identifiers today; this is safe-by-construction. */
function escapeSnippet(text: string): string {
  return text.replace(/[\\$}]/g, (c) => "\\" + c);
}

/**
 * Starter-skeleton snippets offered per file-type section on a fresh line.
 * Seed keys are the section's required/conventional first key (Kube/Build/Image
 * required; Container's Image is the conventional member of the
 * Image/Rootfs one-of); sections with no unconditional required key get a
 * header + caret only.
 */
export const SECTION_SKELETONS: Readonly<Record<string, string>> = {
  Container: "[Container]\nImage=$0",
  Pod: "[Pod]\n$0",
  Network: "[Network]\n$0",
  Volume: "[Volume]\n$0",
  Kube: "[Kube]\nYaml=$0",
  Build: "[Build]\nImageTag=$0",
  Image: "[Image]\nImage=$0",
  Artifact: "[Artifact]\n$0",
};

function sectionCompletions(fileName?: string, includeSkeleton = false): CompletionItem[] {
  let expected: string | null = null;
  if (fileName) {
    const exp = expectedSectionFor(fileName);
    if (exp) expected = exp.section;
  }

  const items: CompletionItem[] = [];
  if (includeSkeleton && expected !== null && SECTION_SKELETONS[expected]) {
    items.push({ label: `[${expected}] (skeleton)`, snippet: SECTION_SKELETONS[expected] });
  }
  for (const name of KNOWN_SECTIONS) {
    if (expected !== null && FILE_TYPE_SECTIONS.has(name) && name !== expected) continue;
    items.push({ label: name });
  }
  return items;
}

function keyCompletions(section: string): CompletionItem[] {
  const keys = getSectionKeys(section);
  if (!keys) return [];
  return [...keys].map((label) => ({ label, snippet: `${escapeSnippet(label)}=$0` }));
}

function systemdKeyCompletions(section: string): CompletionItem[] {
  const keys = getSystemdSectionKeys(section);
  if (!keys) return [];
  return [...keys].map((label) => ({ label, snippet: `${escapeSnippet(label)}=$0` }));
}

/** A single suggested fix for a diagnostic, expressed as a set of text edits. */
export interface QuickFix {
  title: string;
  edits: TextEdit[];
}

/**
 * Compute quick fixes for `diagnostic` in `text`. Handles
 * {@link Codes.UNKNOWN_KEY} (QL030): when the typo'd key has a close match
 * among the enclosing section's valid keys (see {@link findBestMatch}), this
 * returns a single fix that replaces the key with the match. Also handles
 * {@link Codes.UNKNOWN_SECTION} (QL010): when the typo'd section name has a
 * close match among {@link KNOWN_SECTIONS}, this returns a single fix that
 * replaces the section header with the match. Also handles
 * {@link Codes.ENUM_VALUE} (QL040): when the invalid value has a close match
 * among the key's curated closed-set of values (see {@link getEnumValues}),
 * this returns a single fix that replaces the value with the match. Also
 * handles {@link Codes.SECTION_FILE_MISMATCH} (QL050), but only when
 * `fileName` is given (otherwise `[]`): for a section/file-type mismatch
 * (`diagnostic.severity === "warning"`) this returns a single fix that
 * replaces the section header with the expected one; for a missing required
 * section (`diagnostic.severity === "error"`) this returns a single fix that
 * inserts the expected section at the top of the file. Returns `[]` for any
 * other diagnostic code, or when no close match / expected section exists.
 */
export function getQuickFixes(text: string, diagnostic: Diagnostic, fileName?: string): QuickFix[] {
  if (diagnostic.code === Codes.UNKNOWN_SECTION) {
    const lines = text.split(/\r?\n/);
    const token = lines[diagnostic.line - 1]!.slice(diagnostic.startColumn - 1, diagnostic.endColumn - 1); // "[name]"
    const name = token.slice(1, -1); // strip the surrounding [ ]
    const match = findBestMatch(name, KNOWN_SECTIONS);
    if (match === null) return [];
    return [
      {
        title: `Change to "[${match}]"`,
        edits: [
          {
            line: diagnostic.line,
            startColumn: diagnostic.startColumn,
            endColumn: diagnostic.endColumn,
            newText: `[${match}]`,
          },
        ],
      },
    ];
  }

  if (diagnostic.code === Codes.ENUM_VALUE) {
    const lines = text.split(/\r?\n/);

    let currentSection: string | null = null;
    let inContinuation = false;

    for (let i = 0; i < diagnostic.line - 1; i++) {
      const raw = lines[i]!;

      if (inContinuation) {
        inContinuation = endsWithContinuation(raw);
        continue;
      }

      const trimmed = raw.trim();
      if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";")) {
        continue;
      }

      const sectionMatch = SECTION_RE.exec(raw);
      if (sectionMatch) {
        currentSection = sectionMatch.groups!.name!;
        inContinuation = endsWithContinuation(raw);
        continue;
      }

      const eq = raw.indexOf("=");
      if (eq === -1) {
        inContinuation = endsWithContinuation(raw);
        continue;
      }

      inContinuation = endsWithContinuation(raw);
    }

    if (currentSection === null) return [];

    const diagLine = lines[diagnostic.line - 1]!;
    const eq = diagLine.indexOf("=");
    if (eq === -1) return [];
    const key = diagLine.slice(0, eq).trim();

    const values = getEnumValues(currentSection, key);
    if (!values) return [];

    const value = diagLine.slice(diagnostic.startColumn - 1, diagnostic.endColumn - 1);
    const match = findBestMatch(value.toLowerCase(), values);
    if (match === null) return [];

    return [
      {
        title: `Change to "${match}"`,
        edits: [
          {
            line: diagnostic.line,
            startColumn: diagnostic.startColumn,
            endColumn: diagnostic.endColumn,
            newText: match,
          },
        ],
      },
    ];
  }

  if (diagnostic.code === Codes.SECTION_FILE_MISMATCH) {
    if (!fileName) return [];

    const expected = expectedSectionFor(fileName);
    if (expected === null) return [];

    if (diagnostic.severity === "warning") {
      return [
        {
          title: `Change to "[${expected.section}]"`,
          edits: [
            {
              line: diagnostic.line,
              startColumn: diagnostic.startColumn,
              endColumn: diagnostic.endColumn,
              newText: `[${expected.section}]`,
            },
          ],
        },
      ];
    }

    return [
      {
        title: `Insert "[${expected.section}]" section`,
        edits: [{ line: 1, startColumn: 1, endColumn: 1, newText: `[${expected.section}]\n` }],
      },
    ];
  }

  if (diagnostic.code !== Codes.UNKNOWN_KEY) return [];

  const lines = text.split(/\r?\n/);

  let currentSection: string | null = null;
  let inContinuation = false;

  for (let i = 0; i < diagnostic.line - 1; i++) {
    const raw = lines[i]!;

    if (inContinuation) {
      inContinuation = endsWithContinuation(raw);
      continue;
    }

    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }

    const sectionMatch = SECTION_RE.exec(raw);
    if (sectionMatch) {
      currentSection = sectionMatch.groups!.name!;
      inContinuation = endsWithContinuation(raw);
      continue;
    }

    const eq = raw.indexOf("=");
    if (eq === -1) {
      inContinuation = endsWithContinuation(raw);
      continue;
    }

    inContinuation = endsWithContinuation(raw);
  }

  if (currentSection === null) return [];

  const keys = getSectionKeys(currentSection);
  if (!keys) return [];

  const key = lines[diagnostic.line - 1]!.slice(diagnostic.startColumn - 1, diagnostic.endColumn - 1);
  const match = findBestMatch(key, keys);
  if (match === null) return [];

  return [
    {
      title: `Change to "${match}"`,
      edits: [
        {
          line: diagnostic.line,
          startColumn: diagnostic.startColumn,
          endColumn: diagnostic.endColumn,
          newText: match,
        },
      ],
    },
  ];
}

export { lintQuadlet } from "./index.js";
