/**
 * Byte-size-format checking for the Quadlet `Memory=`/`ShmSize=` keys
 * (Container, Pod).
 *
 * source: podman-systemd.unit(5) - Container.Memory= and Container.ShmSize=
 * / Pod.ShmSize=, both documented as taking a "number of bytes" value with
 * an optional unit suffix, passed through to Podman which parses them with
 * Go's `docker/go-units` package (`RAMInBytes` for Memory=, `parseSize` /
 * `FromHumanSize` for ShmSize=).
 */

/**
 * The section+key pairs whose value is a Podman go-units byte size and
 * should be checked with {@link isMalformedByteSize}.
 *
 * `Memory` and `ShmSize` share the same accepted string set even though
 * Podman parses them with different go-units entry points (`RAMInBytes` vs
 * `parseSize`/`FromHumanSize`): the distinction between those functions is
 * which multiplier table they use (1024-based vs 1000-based ambiguity for
 * the bare letter suffixes), not the shape of the string they accept.
 *
 * source: podman-systemd.unit(5) - the documented Memory= key
 * (Container.Memory) and ShmSize= key (Container.ShmSize, Pod.ShmSize).
 */
export const BYTE_SIZE_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  Container: new Set(["Memory", "ShmSize"]),
  Pod: new Set(["ShmSize"]),
};

/**
 * Whether `value` cannot possibly be a valid go-units byte size.
 *
 * Zero-false-positive rationale: `docker/go-units` parses these values with
 * a grammar of a number (optionally with a decimal point), an optional
 * single space, and then an optional unit suffix made up of at most one
 * size-prefix letter from {k,m,g,t,p} followed by an optional `i` (for the
 * 1024-based "kibi" style units) and an optional `b`, all case-insensitive.
 * That accepts values like `512`, `512b`, `512k`, `512kb`, `512kib`, `1.5g`,
 * and `512 m`, while rejecting a value like `512mk` (two prefix letters) or
 * `big` (no leading digit at all).
 *
 * This is a closed-set bet on the go-units unit vocabulary, which has been
 * frozen at kilo/mega/giga/tera/peta for roughly a decade. A brand-new SI
 * prefix (e.g. exa) being added is both improbable upstream and physically
 * irrelevant for container memory limits, so the residual forward-compat
 * risk of this closed set is negligible.
 *
 * Like the sibling QL040/QL080/QL081 checks, this function relies on the
 * caller applying the existing interpolation/continuation bypass first:
 * values containing `$`, backtick command substitution, `%` specifiers, or
 * `{{` templating, or ending in a line continuation, never reach here.
 *
 * source: podman-systemd.unit(5) Memory=/ShmSize=; docker/go-units
 * (`RAMInBytes`, `parseSize`/`FromHumanSize`).
 */
export function isMalformedByteSize(value: string): boolean {
  return !/^\d+(\.\d+)?[ ]?[kKmMgGtTpP]?[iI]?[bB]?$/.test(value);
}
