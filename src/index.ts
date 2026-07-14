/**
 * quadlet-lint core — a pure, dependency-free linter for Podman Quadlet unit
 * files (.container, .pod, .network, .volume, .kube, .build, .image).
 *
 * The authoritative validator for Quadlet is always
 * `podman-system-generator --dryrun`, which needs Podman on the host. This
 * linter covers only the mistakes that can be caught by looking at the text
 * alone, and it deliberately errs toward silence: anything it reports as an
 * `error` would genuinely fail systemd/Quadlet, and anything uncertain is at
 * most a `warning`.
 */

import {
  KNOWN_SECTIONS,
  isUserDefinedSection,
  isSingleValueKey,
  isKnownKey,
  hasKeyData,
  getEnumValues,
} from "./sections.js";

export type Severity = "error" | "warning";

/**
 * A single lint result. All positions are 1-based, matching Monaco's marker
 * model: `startColumn` is the column of the first character, `endColumn` is the
 * column just past the last character (exclusive).
 */
export interface Diagnostic {
  /** 1-based line number. */
  line: number;
  /** 1-based column of the first character of the flagged range. */
  startColumn: number;
  /** 1-based column just past the last character of the flagged range. */
  endColumn: number;
  severity: Severity;
  /** Stable machine code, e.g. "QL001". See {@link Codes}. */
  code: string;
  message: string;
}

/** Stable diagnostic codes. Kept as a const map so consumers can reference them. */
export const Codes = {
  /** A non-blank, non-comment line that is neither a section header nor Key=Value. */
  MALFORMED_LINE: "QL001",
  /** An assignment that appears before any [Section] header. */
  ASSIGNMENT_OUTSIDE_SECTION: "QL002",
  /** A section header that is not a known/user-defined section. */
  UNKNOWN_SECTION: "QL010",
  /** A single-valued key that appears more than once in the same section. */
  DUPLICATE_KEY: "QL020",
  /** A key that is not documented for its (Quadlet-specific) section. */
  UNKNOWN_KEY: "QL030",
  /** A value outside the curated closed set of allowed values for its key. */
  ENUM_VALUE: "QL040",
} as const;

/** A section header line, e.g. `[Container]`. */
const SECTION_RE = /^\s*\[(?<name>[^\]]*)\]\s*$/;

/**
 * Lint Quadlet unit file text.
 *
 * @param text Full unit file contents.
 * @param options.fileName Optional source file name. Currently unused here;
 *   reserved for section-extension cross-checks (QL050).
 * @returns Diagnostics in source order (by line, then column).
 */
export function lintQuadlet(text: string, options?: { fileName?: string }): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);

  /** Name of the section we are currently inside, or null before the first one. */
  let currentSection: string | null = null;
  /**
   * Keys already seen in the current section, mapped to the line where they
   * first appeared. Reset on each new section header. Only used to detect
   * duplicates of known single-valued keys.
   */
  let seenKeys = new Map<string, number>();
  /**
   * When a value line ends with a backslash it continues onto the next
   * physical line(s). Those continuation lines are part of the value and must
   * not be classified as their own statements.
   */
  let inContinuation = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNo = i + 1;

    // A continuation line belongs to the previous assignment's value.
    if (inContinuation) {
      inContinuation = endsWithContinuation(raw);
      continue;
    }

    const trimmed = raw.trim();

    // Blank lines and comments are always fine. systemd treats lines starting
    // with '#' or ';' as comments.
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }

    // Section header.
    const sectionMatch = SECTION_RE.exec(raw);
    if (sectionMatch) {
      const name = sectionMatch.groups!.name!;
      currentSection = name;
      seenKeys = new Map();

      const known = KNOWN_SECTIONS.has(name) || isUserDefinedSection(name);
      if (!known) {
        // Flag the header itself (the `[...]` token).
        const start = raw.indexOf("[");
        const end = raw.indexOf("]", start) + 1;
        diagnostics.push({
          line: lineNo,
          startColumn: start + 1,
          endColumn: end + 1,
          severity: "warning",
          code: Codes.UNKNOWN_SECTION,
          message:
            name === ""
              ? "Empty section name."
              : `Unknown section "[${name}]". This will be ignored — check for a typo or a wrong file type.`,
        });
      }

      inContinuation = endsWithContinuation(raw);
      continue;
    }

    // Anything that reaches here should be a Key=Value assignment.
    const eq = raw.indexOf("=");
    if (eq === -1) {
      // No '=', not a section, not a comment → systemd rejects this outright.
      const start = raw.length - raw.trimStart().length;
      diagnostics.push({
        line: lineNo,
        startColumn: start + 1,
        endColumn: raw.length + 1,
        severity: "error",
        code: Codes.MALFORMED_LINE,
        message: "Not a valid line: expected a Key=Value pair, a [Section] header, or a comment.",
      });
      inContinuation = endsWithContinuation(raw);
      continue;
    }

    const key = raw.slice(0, eq).trim();
    const keyStart = raw.length - raw.trimStart().length;

    // An assignment before any section header is an error in systemd.
    if (currentSection === null) {
      diagnostics.push({
        line: lineNo,
        startColumn: keyStart + 1,
        endColumn: eq + 1,
        severity: "error",
        code: Codes.ASSIGNMENT_OUTSIDE_SECTION,
        message: `Assignment "${key}=" appears before any [Section] header.`,
      });
      inContinuation = endsWithContinuation(raw);
      continue;
    }

    // Unknown-key detection, restricted to the Quadlet-specific sections we
    // have authoritative key lists for. Standard systemd sections
    // ([Unit]/[Service]/[Install]) are left alone — their key surface is
    // open-ended. Kept a warning: the key list is a doc snapshot, so a newer
    // Podman key must never be reported as a hard error.
    if (hasKeyData(currentSection) && !isKnownKey(currentSection, key)) {
      diagnostics.push({
        line: lineNo,
        startColumn: keyStart + 1,
        endColumn: keyStart + key.length + 1,
        severity: "warning",
        code: Codes.UNKNOWN_KEY,
        message: `Unknown key "${key}" in [${currentSection}]. Check for a typo, or it may be from a newer Podman version.`,
      });
    }

    // Enum-value detection, restricted to keys we have a curated closed-set
    // vocabulary for. The table is a hand-curated doc snapshot, not the
    // authoritative Quadlet parser, so this stays a warning even when a value
    // isn't recognized — it may simply be valid in a newer Podman version.
    // Multi-line (continued) values are out of scope: we only ever see the
    // first physical line's tail, which isn't the full value.
    if (!endsWithContinuation(raw)) {
      const allowed = getEnumValues(currentSection, key);
      if (allowed !== undefined) {
        const rawValue = raw.slice(eq + 1);
        const value = rawValue.trim();
        const hasInterpolation =
          value.includes("$") || value.includes("`") || value.includes("%") || value.includes("{{");
        if (value !== "" && !hasInterpolation && !allowed.has(value.toLowerCase())) {
          const valueStart = eq + 1 + (rawValue.length - rawValue.trimStart().length);
          diagnostics.push({
            line: lineNo,
            startColumn: valueStart + 1,
            endColumn: valueStart + value.length + 1,
            severity: "warning",
            code: Codes.ENUM_VALUE,
            message: `Unrecognized value "${value}" for ${key}= — expected one of: ${[...allowed].join(", ")}. It may also be valid in a newer Podman version.`,
          });
        }
      }
    }

    // Duplicate detection, restricted to keys we know are single-valued so that
    // legitimately-repeatable keys (Volume=, PublishPort=, Environment=, ...)
    // are never flagged.
    if (isSingleValueKey(currentSection, key)) {
      const firstLine = seenKeys.get(key);
      if (firstLine !== undefined) {
        diagnostics.push({
          line: lineNo,
          startColumn: keyStart + 1,
          endColumn: keyStart + key.length + 1,
          severity: "warning",
          code: Codes.DUPLICATE_KEY,
          message: `Duplicate key "${key}" (first set on line ${firstLine}). The last value wins; the earlier one is ignored.`,
        });
      } else {
        seenKeys.set(key, lineNo);
      }
    }

    inContinuation = endsWithContinuation(raw);
  }

  return diagnostics;
}

/**
 * Whether a physical line continues onto the next one. systemd uses a trailing
 * backslash as the continuation marker; an even number of trailing backslashes
 * is an escaped backslash and does NOT continue.
 */
function endsWithContinuation(raw: string): boolean {
  let backslashes = 0;
  for (let i = raw.length - 1; i >= 0 && raw[i] === "\\"; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}
