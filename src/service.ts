/**
 * Editor-neutral service layer on top of the pure lint core. This module
 * defines plain-data types (no editor SDK dependency) so that different
 * editor adapters (Monaco, CodeMirror, LSP, …) can each translate to/from
 * their own coordinate systems without pulling in an editor at all.
 */

import { SECTION_RE, endsWithContinuation } from "./index.js";
import { hasKeyData, isKnownKey, getKeyDescription } from "./sections.js";

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

      if (!hasKeyData(currentSection) || !isKnownKey(currentSection, key)) return null;

      return { section: currentSection, key, description: getKeyDescription(currentSection, key) };
    }

    inContinuation = endsWithContinuation(raw);
  }

  return null;
}

export { lintQuadlet } from "./index.js";
