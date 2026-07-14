/**
 * Static knowledge about Quadlet unit files.
 *
 * Quadlet files are systemd units, so they share the standard systemd sections
 * ([Unit], [Service], [Install]) and add Quadlet-specific ones per file type
 * (.container -> [Container], .pod -> [Pod], etc.).
 *
 * The per-section key data lives in `generated/keys.ts`, extracted from the
 * vendored Podman man page by `scripts/extract-keys.mjs`. Everything here stays
 * conservative so the linter can keep its "zero false errors" promise.
 */

import { SECTION_KEYS } from "./generated/keys.js";
import { SECTION_ENUMS } from "./enums.js";

/** Standard systemd sections, valid in any unit file. */
const SYSTEMD_SECTIONS = ["Unit", "Service", "Install"] as const;

/** The Quadlet-specific sections we have authoritative key data for. */
export const QUADLET_SECTIONS: ReadonlySet<string> = new Set(Object.keys(SECTION_KEYS));

/**
 * Sections systemd / Quadlet understand. Anything else is either a typo or a
 * user-defined `X-` section (which systemd explicitly allows and ignores).
 */
export const KNOWN_SECTIONS: ReadonlySet<string> = new Set([
  ...SYSTEMD_SECTIONS,
  ...QUADLET_SECTIONS,
]);

/**
 * systemd convention: sections whose name starts with `X-` are reserved for
 * private use and are never rejected. We must not flag them as unknown.
 */
export function isUserDefinedSection(name: string): boolean {
  return name.startsWith("X-");
}

/**
 * Whether we have an authoritative key list for `section` (i.e. it is a
 * Quadlet-specific section). We deliberately do NOT validate keys in the
 * standard systemd sections, whose key surface is open-ended.
 */
export function hasKeyData(section: string): boolean {
  return section in SECTION_KEYS;
}

/**
 * Whether `key` is a documented valid key for `section`. Only meaningful when
 * {@link hasKeyData} is true. Comparison is case-sensitive, matching systemd.
 */
export function isKnownKey(section: string, key: string): boolean {
  return SECTION_KEYS[section]?.valid.has(key) ?? false;
}

/**
 * Whether `key` in `section` is known to be single-valued (and therefore a
 * candidate for duplicate-key warnings). Keys of unknown repeatability return
 * false so they are never flagged.
 */
export function isSingleValueKey(section: string, key: string): boolean {
  return SECTION_KEYS[section]?.singleValue.has(key) ?? false;
}

/**
 * The set of allowed values for `key` in `section`, if we have a curated
 * closed-set enum for it. Returns undefined when the key is free-form (or
 * simply not in our curated table), in which case no enum validation should
 * be attempted.
 */
export function getEnumValues(section: string, key: string): ReadonlySet<string> | undefined {
  return SECTION_ENUMS[section]?.[key];
}

/** Quadlet file extension (without the leading dot) to the section it implies. */
const EXTENSION_SECTIONS: Readonly<Record<string, string>> = {
  container: "Container",
  pod: "Pod",
  network: "Network",
  volume: "Volume",
  kube: "Kube",
  build: "Build",
  image: "Image",
  artifact: "Artifact",
};

/**
 * The Quadlet sections that are each tied to exactly one file type (i.e. the
 * values of {@link EXTENSION_SECTIONS}). Unlike `QUADLET_SECTIONS`, this
 * excludes sections such as `[Quadlet]` that are valid across every file
 * type, so it's the right set to use when cross-checking a section header
 * against the file's own extension.
 */
export const FILE_TYPE_SECTIONS: ReadonlySet<string> = new Set(Object.values(EXTENSION_SECTIONS));

/**
 * The Quadlet section a unit file's own extension implies, e.g. `web.container`
 * implies `[Container]`, and whether that file is a drop-in (`.conf`) rather
 * than a unit file proper. Matching is case-sensitive on the extension after
 * the last `.` of the basename. Returns null for extensions we don't
 * recognize or names with no extension at all.
 *
 * `.conf` files are drop-ins: systemd/Quadlet resolve their section from the
 * immediate parent directory, not from the `.conf` extension itself. The
 * parent must be exactly `<type>.d` or end with `.<type>.d` for one of the
 * known Quadlet types (this matches `foo.container.d`, the dash-truncated
 * `foo-.container.d`, the templated `foo@.container.d`, and a bare top-level
 * `container.d`, while correctly rejecting a parent that merely ends with the
 * type name, like `mycontainer.d`). A `.conf` with no matching parent returns
 * null.
 */
export function expectedSectionFor(
  fileName: string,
): { section: string; isDropin: boolean } | null {
  const segments = fileName.split("/");
  const base = segments.pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = base.slice(dot + 1);

  if (ext === "conf") {
    const parent = segments.pop();
    if (parent === undefined) return null;
    for (const [type, section] of Object.entries(EXTENSION_SECTIONS)) {
      const suffix = `${type}.d`;
      if (parent === suffix || parent.endsWith(`.${suffix}`)) {
        return { section, isDropin: true };
      }
    }
    return null;
  }

  const section = EXTENSION_SECTIONS[ext];
  return section !== undefined ? { section, isDropin: false } : null;
}
