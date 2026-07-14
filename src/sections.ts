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
 * The Quadlet section a unit file's own extension implies, e.g. `web.container`
 * implies `[Container]`. Matching is case-sensitive on the extension after the
 * last `.` of the basename. Returns null for extensions we don't recognize or
 * names with no extension at all. Resolution of `.conf` drop-ins (which inherit
 * their target unit's section) is deliberately out of scope here and is handled
 * later by QL050.
 */
export function expectedSectionFor(fileName: string): string | null {
  const base = fileName.split("/").pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = base.slice(dot + 1);
  return EXTENSION_SECTIONS[ext] ?? null;
}
