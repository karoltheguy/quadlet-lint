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
  FILE_TYPE_SECTIONS,
  isUserDefinedSection,
  isSingleValueKey,
  isKnownKey,
  hasKeyData,
  getEnumValues,
  getSectionKeys,
  getConflictingKeys,
  expectedSectionFor,
} from "./sections.js";
import { findBestMatch } from "./levenshtein.js";

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
  /**
   * A file-specific Quadlet section that doesn't match the file's type, or
   * the expected section missing entirely.
   */
  SECTION_FILE_MISMATCH: "QL050",
  /** Two keys in the same section that Quadlet's generator refuses to accept together. */
  CONFLICTING_KEYS: "QL070",
} as const;

/**
 * A section header line, e.g. `[Container]`. Exported for internal reuse by
 * the service layer (src/service.ts), which needs to mirror this same line
 * classification when locating the hovered key.
 */
export const SECTION_RE = /^\s*\[(?<name>[^\]]*)\]\s*$/;

/** Matches a `# quadlet-lint-disable-next-line QLxxx` suppression directive comment. */
const DISABLE_NEXT_LINE_RE = /^#\s*quadlet-lint-disable-next-line\s+(QL\d{3})\b/;

/**
 * Lint Quadlet unit file text.
 *
 * @param text Full unit file contents.
 * @param options.fileName Optional source file name, used to resolve the
 *   section a `.container`/`.pod`/etc. file (or a `.conf` drop-in) is
 *   expected to have, enabling the QL050 cross-checks.
 * @returns Diagnostics in source order (by line, then column).
 */
export function lintQuadlet(text: string, options?: { fileName?: string }): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);
  const suppress = new Map<number, Set<string>>();
  let pendingSuppress = new Set<string>();

  // QL050 only activates when the caller supplies a fileName we can resolve
  // to an expected section (a recognized Quadlet extension, or a `.conf`
  // drop-in under a recognizable `<type>.d` directory). Without a fileName we
  // have nothing to cross-check the sections against, so no QL050 is emitted.
  const expected = options?.fileName !== undefined ? expectedSectionFor(options.fileName) : null;
  let sawExpectedSection = false;

  /** Name of the section we are currently inside, or null before the first one. */
  let currentSection: string | null = null;
  /**
   * Keys already seen in the current section, mapped to the line where they
   * first appeared. Reset on each new section header. Only used to detect
   * duplicates of known single-valued keys.
   */
  let seenKeys = new Map<string, number>();
  /**
   * Keys already seen in the current section that participate in a curated
   * conflict pair (see {@link getConflictingKeys}) AND currently have a
   * non-empty (trimmed) value, mapped to the line where that value was set.
   * A key with an empty or whitespace-only value is not "set" as far as
   * Quadlet's generator is concerned (it gates on `len(value) > 0`), so an
   * empty assignment removes any prior entry rather than merely skipping it,
   * which gives correct last-wins behavior for single-valued keys. Reset on
   * each new section header, kept separate from `seenKeys` so conflict
   * detection does not depend on a key also being classified as single-valued.
   */
  let seenConflictKeys = new Map<string, number>();
  /**
   * Conflict pairs already reported in the current section, canonicalized as
   * `${a}|${b}` with the two key names sorted. Ensures at most one QL070
   * diagnostic per pair per section even if one side of the pair repeats.
   */
  let reportedConflictPairs = new Set<string>();
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
      const directive = DISABLE_NEXT_LINE_RE.exec(trimmed);
      if (directive) pendingSuppress.add(directive[1]!);
      continue;
    }

    if (pendingSuppress.size > 0) {
      suppress.set(lineNo, new Set(pendingSuppress));
      pendingSuppress.clear();
    }

    // Section header.
    const sectionMatch = SECTION_RE.exec(raw);
    if (sectionMatch) {
      const name = sectionMatch.groups!.name!;
      currentSection = name;
      seenKeys = new Map();
      seenConflictKeys = new Map();
      reportedConflictPairs = new Set();

      const known = KNOWN_SECTIONS.has(name) || isUserDefinedSection(name);
      if (!known) {
        // Flag the header itself (the `[...]` token).
        const start = raw.indexOf("[");
        const end = raw.indexOf("]", start) + 1;
        const suggestion = findBestMatch(name, KNOWN_SECTIONS);
        const suffix = suggestion !== null ? ` Did you mean "[${suggestion}]"?` : "";
        diagnostics.push({
          line: lineNo,
          startColumn: start + 1,
          endColumn: end + 1,
          severity: "warning",
          code: Codes.UNKNOWN_SECTION,
          message:
            name === ""
              ? "Empty section name."
              : `Unknown section "[${name}]". This will be ignored — check for a typo or a wrong file type.${suffix}`,
        });
      }

      // Cross-check against the file-type-specific section, if the caller
      // gave us a fileName we could resolve one from. Standard systemd
      // sections, [Quadlet] (valid across every file type), `X-` sections,
      // and unknown sections are exempt because they are simply not members
      // of FILE_TYPE_SECTIONS.
      if (expected !== null && FILE_TYPE_SECTIONS.has(name)) {
        if (name === expected.section) {
          sawExpectedSection = true;
        } else {
          const start = raw.indexOf("[");
          const end = raw.indexOf("]", start) + 1;
          diagnostics.push({
            line: lineNo,
            startColumn: start + 1,
            endColumn: end + 1,
            severity: "warning",
            code: Codes.SECTION_FILE_MISMATCH,
            message: `Section "[${name}]" does not match this file type — a ${expected.section} file is handled through [${expected.section}]. This section will be ignored.`,
          });
        }
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
      const suggestion = findBestMatch(key, getSectionKeys(currentSection) ?? []);
      const suffix = suggestion !== null ? ` Did you mean "${suggestion}"?` : "";
      diagnostics.push({
        line: lineNo,
        startColumn: keyStart + 1,
        endColumn: keyStart + key.length + 1,
        severity: "warning",
        code: Codes.UNKNOWN_KEY,
        message: `Unknown key "${key}" in [${currentSection}]. Check for a typo, or it may be from a newer Podman version.${suffix}`,
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

    // Mutually-exclusive key detection, restricted to the curated conflict
    // table. Unlike DUPLICATE_KEY above, this is a hard error: both cited
    // Podman source lines make ConvertContainer return a nil unit file, so
    // generation genuinely fails when both keys of a pair are set. Podman's
    // generator itself only treats a key as "set" when its value is
    // non-empty (e.g. `len(image) > 0 && len(rootfs) > 0`), so we mirror
    // that here rather than firing on key presence alone.
    const conflictPartners = getConflictingKeys(currentSection, key);
    if (conflictPartners.length > 0) {
      // A value ending in a backslash continues onto the next physical
      // line(s), so it is never empty regardless of what follows the `=`
      // on this line.
      const isContinued = endsWithContinuation(raw);
      const value = raw.slice(eq + 1).trim();
      const isSet = isContinued || value !== "";

      if (isSet) {
        for (const partner of conflictPartners) {
          const firstLine = seenConflictKeys.get(partner);
          if (firstLine !== undefined) {
            const pairId = [key, partner].sort().join("|");
            if (!reportedConflictPairs.has(pairId)) {
              reportedConflictPairs.add(pairId);
              diagnostics.push({
                line: lineNo,
                startColumn: keyStart + 1,
                endColumn: keyStart + key.length + 1,
                severity: "error",
                code: Codes.CONFLICTING_KEYS,
                message: `Key "${key}" conflicts with "${partner}" (set on line ${firstLine}) — Quadlet fails to generate a service when both are set in [${currentSection}].`,
              });
            }
          }
        }
        if (!seenConflictKeys.has(key)) {
          seenConflictKeys.set(key, lineNo);
        }
      } else {
        // Empty (or whitespace-only) value: systemd is last-wins for
        // single-valued keys, so this genuinely unsets any earlier value.
        // Remove the prior entry rather than merely skipping the update.
        seenConflictKeys.delete(key);
      }
    }

    inContinuation = endsWithContinuation(raw);
  }

  // Mismatch above is a warning (the section is merely ignored, everything
  // else in the file still works); a missing required section is an error,
  // because Quadlet genuinely refuses to generate a service unit without it.
  // Drop-ins are exempt: a `.conf` override legitimately contains only the
  // keys it's overriding and never needs to repeat the main section.
  if (expected !== null && !expected.isDropin && !sawExpectedSection) {
    diagnostics.push({
      line: 1,
      startColumn: 1,
      endColumn: Math.max(2, (lines[0]?.length ?? 0) + 1),
      severity: "error",
      code: Codes.SECTION_FILE_MISMATCH,
      message: `Missing required [${expected.section}] section — Quadlet fails to generate a service without it.`,
    });
  }

  return diagnostics.filter((d) => !suppress.get(d.line)?.has(d.code));
}

/**
 * Whether a physical line continues onto the next one. systemd uses a trailing
 * backslash as the continuation marker; an even number of trailing backslashes
 * is an escaped backslash and does NOT continue.
 *
 * Exported for internal reuse by the service layer (src/service.ts), which
 * needs to mirror this same continuation-tracking logic when walking lines.
 */
export function endsWithContinuation(raw: string): boolean {
  let backslashes = 0;
  for (let i = raw.length - 1; i >= 0 && raw[i] === "\\"; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}
