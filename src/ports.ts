/**
 * Port-range format checking for Quadlet keys whose value is a Podman
 * `--publish`/`--expose`-style port mapping (e.g. `PublishPort=`).
 *
 * source: podman-systemd.unit(5) — PublishPort= "Exposes a port, or a range of
 * ports ... in the format ip:hostPort:containerPort", and ExposeHostPort=
 * (Container). Pod/Kube PublishPort= share the same syntax.
 */

/**
 * The section+key pairs whose value is a Podman port mapping and should be
 * checked with {@link isMalformedPortValue}.
 *
 * source: podman-systemd.unit(5) — the documented `--publish`/`--expose`
 * port keys (Container.PublishPort, Container.ExposeHostPort, Pod.PublishPort,
 * Kube.PublishPort).
 */
export const PORT_FORMAT_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  Container: new Set(["PublishPort", "ExposeHostPort"]),
  Pod: new Set(["PublishPort"]),
  Kube: new Set(["PublishPort"]),
};

/**
 * Whether `value` contains a numeric token that cannot possibly be a valid
 * port number (i.e. greater than 65535).
 *
 * Zero-false-positive rationale: a valid port mapping value has the general
 * shape `[ip:]hostPort[:containerPort][/protocol]`, optionally with port
 * *ranges* (`50-59:5000-5009`) and a bracketed IPv6 address
 * (`[2001:db8::1]:8080:80`). We tokenize the value by splitting on the
 * delimiter class `[:/\-\[\]]` (colon, slash, hyphen, and the two bracket
 * characters) and inspect only the tokens that are a pure run of decimal
 * digits (`/^\d+$/`). The only numeric fields that can ever appear in a
 * valid value are port numbers, whose ceiling is 65535, so any pure-decimal
 * token exceeding that is unambiguously malformed.
 *
 * This tokenization is deliberately narrow so it never misfires on the two
 * other kinds of numeric-looking content that can appear in the same value:
 *   - IPv4 addresses survive as whole dotted tokens, because `.` is *not*
 *     one of the delimiter characters — so `0.0.0.0` never splits into its
 *     individual octets and is never inspected as a number.
 *   - IPv6 hextets, once bracket/colon delimiters are stripped, are each a
 *     pure-decimal run of at most 4 hex digits; even in the worst case where
 *     every hex digit happens to be a decimal digit (e.g. `9999`), the value
 *     is still far below the 65535 port ceiling, so hextets can never be
 *     mistaken for an out-of-range port.
 *
 * Two load-bearing assumptions this function relies on and does not itself
 * handle:
 *   (a) The value `0` is deliberately never flagged — not because of IPv4
 *       `0.0.0.0` (whose token never splits into `0` in the first place, as
 *       explained above), but because IPv6 `[::0]` yields a bare `0` token,
 *       which is a valid hextet and must not be treated as an invalid port.
 *   (b) IPv6 zone IDs, e.g. `fe80::1%eth0`, contain a `%` character that this
 *       function does not special-case at all. Callers must apply the
 *       existing interpolation bypass (which already treats any value
 *       containing `%` as non-checkable) *before* calling this function, so
 *       zone-ID values never reach here.
 */
export function isMalformedPortValue(value: string): boolean {
  const tokens = value.split(/[:/\-[\]]/);
  for (const token of tokens) {
    if (/^\d+$/.test(token) && Number(token) > 65535) {
      return true;
    }
  }
  return false;
}
