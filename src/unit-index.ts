/**
 * A lightweight index of the unit files seen in a lint run, keyed by their
 * basename (e.g. "web.container", "data.volume") — the same name+type token
 * that cross-unit references (`Container=`, `Network=`, `Pod=`, etc.) use to
 * point at other Quadlet units.
 *
 * This is pure plumbing for a future cross-unit check (QL090, "reference to
 * an undeclared unit"). It emits no diagnostics itself.
 */

import { expectedSectionFor } from "./sections.js";

/** Basenames of the recognized (non-drop-in) unit files in a scanned set. */
export type UnitIndex = ReadonlySet<string>;

/**
 * Build a {@link UnitIndex} from a list of file paths. Each path is
 * classified with {@link expectedSectionFor}; only entries it recognizes as
 * an actual unit file (`isDropin === false`) are included — drop-in `.conf`
 * files are not referenceable units, and unrecognized files are skipped
 * entirely. The stored value is the path's basename (the substring after the
 * last `/`).
 */
export function buildUnitIndex(fileNames: readonly string[]): UnitIndex {
  const index = new Set<string>();

  for (const fileName of fileNames) {
    const expected = expectedSectionFor(fileName);
    if (expected === null || expected.isDropin) continue;

    const lastSlash = fileName.lastIndexOf("/");
    const base = lastSlash === -1 ? fileName : fileName.slice(lastSlash + 1);
    index.add(base);
  }

  return index;
}
