/**
 * Duration-format checking for the Quadlet health-check timing keys
 * (`HealthInterval=`, `HealthTimeout=`, `HealthStartPeriod=`,
 * `HealthStartupInterval=`, `HealthStartupTimeout=`), all in [Container].
 *
 * source: podman-systemd.unit(5) - these map to the Podman `--health-*`
 * options, whose values are parsed by Go's `time.ParseDuration`.
 */

/**
 * The section+key pairs whose value is a Go duration and should be checked
 * with {@link isMalformedDuration}.
 *
 * source: podman-systemd.unit(5) - the documented `--health-*` timing keys.
 */
export const DURATION_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  Container: new Set([
    "HealthInterval",
    "HealthTimeout",
    "HealthStartPeriod",
    "HealthStartupInterval",
    "HealthStartupTimeout",
  ]),
};

/**
 * A Go `time.ParseDuration` value: a sequence of decimal-number + unit pairs
 * (optionally signed), or a bare `0`. Units are exactly the closed set Go
 * accepts - `ns`, `us`/`µs`/`μs` (both the micro sign U+00B5 and the Greek
 * mu U+03BC), `ms`, `s`, `m`, `h`. A fraction is allowed per component, with
 * or without a leading digit (`1.5h`, `.5s`).
 */
const GO_DURATION_RE =
  /^[+-]?(0|(([0-9]+(\.[0-9]*)?|\.[0-9]+)(ns|us|µs|μs|ms|s|m|h))+)$/;

/**
 * Whether `value` cannot possibly be a valid health-check duration.
 *
 * Zero-false-positive rationale: Quadlet passes these values through to
 * Podman's `--health-*` options, which parse them with Go's
 * `time.ParseDuration`. That parser's unit set has been frozen since Go 1.0
 * (2012) - the Go team has repeatedly and explicitly rejected adding day/week
 * units, and the only change in its history was accepting the Greek-mu glyph
 * as an alias for the micro sign, both of which {@link GO_DURATION_RE}
 * already covers. So the accepted-string set is a stable closed set, not a
 * moving target, and flagging a value that fails to parse is safe.
 *
 * Two deliberate carve-outs:
 *   - The literal `disable` is a documented special value on the interval
 *     keys (Podman rewrites it to `0` before parsing). We accept it on every
 *     duration key: on a timeout key the worst case is a missed diagnostic,
 *     never a false positive. It is matched case-sensitively, because Podman
 *     rejects `Disable`, so flagging that spelling would be correct anyway
 *     (we simply don't, keeping the check one-directional and conservative).
 *   - We never judge positivity or range. A `-1s` that Podman later rejects
 *     at validation time is Podman's error to report; this check only fires
 *     on values the *parser* provably rejects, which is what keeps it
 *     false-positive-free.
 *
 * This is exactly the systemd-style-syntax mistake Quadlet users make most:
 * `.container` files look like `.service` files, so `HealthInterval=30`
 * (bare seconds), `5min`, `1h 30min`, or `infinity` get written - all valid
 * in a real unit file, all rejected by `time.ParseDuration`.
 *
 * Like the sibling QL040/QL080/QL081/QL082 checks, this relies on the caller
 * applying the interpolation bypass first (values with `$`, backtick, `%`,
 * or `{{` never reach here).
 */
export function isMalformedDuration(value: string): boolean {
  if (value === "disable") return false;
  return !GO_DURATION_RE.test(value);
}
