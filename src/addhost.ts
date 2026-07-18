/**
 * AddHost-format checking for the Quadlet `AddHost=` key (Container, Pod).
 *
 * source: podman-systemd.unit(5) - AddHost= "Add a custom host-to-IP mapping
 * (host:ip)", passed through to `--add-host`.
 */

/**
 * The section+key pairs whose value is a Podman host-to-IP mapping and
 * should be checked with {@link isMalformedAddHost}.
 *
 * source: podman-systemd.unit(5) - the documented AddHost= key
 * (Container.AddHost, Pod.AddHost).
 */
export const ADD_HOST_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  Container: new Set(["AddHost"]),
  Pod: new Set(["AddHost"]),
};

/**
 * Whether `value` cannot possibly be a valid AddHost= mapping.
 *
 * Zero-false-positive rationale: AddHost= is documented as `hostname:ip`, so
 * a valid value always carries one of two separators between the hostname
 * and its target. A value containing NEITHER `:` NOR `=` cannot be a
 * host-to-IP mapping under any Docker/Podman release, so flagging it is
 * safe. We deliberately check for the absence of BOTH separators rather
 * than either alone:
 *
 *   (a) A bare hostname (e.g. `example.com`) contains neither `:` nor `=`,
 *       so its absence is exactly the signal we want to catch - the user
 *       forgot the IP/target half of the mapping entirely.
 *   (b) Every valid target keeps the `:` separator: the plain
 *       `host:ip` form, the `host:host-gateway` special value documented
 *       for reaching the container-host gateway, and an unbracketed IPv6
 *       target (`host:2001:db8::1`, where the IPv6 address itself also
 *       contains colons) all contain at least one `:`. None of these are
 *       ever flagged.
 *   (c) Docker Engine 25 added `hostname=ip` as an additional accepted
 *       `--add-host` separator, and Podman tracks Docker CLI parity for
 *       `--add-host`. A value like `foo=192.0.2.1` may therefore be
 *       accepted by a newer Podman even though it isn't the separator
 *       documented in podman-systemd.unit(5) today. The `=` exemption
 *       exists purely as false-positive armor for that forward-compat
 *       case - it is not part of the documented syntax we're validating
 *       against, so we never mention `=` in the diagnostic message.
 *
 * Like the sibling QL040/QL080 checks, this function relies on the caller
 * applying the existing interpolation bypass first: values containing `$`,
 * backtick command substitution, `%` specifiers, or `{{` templating never
 * reach here, since their expanded form is unknowable from the source text
 * alone.
 */
export function isMalformedAddHost(value: string): boolean {
  return !value.includes(":") && !value.includes("=");
}
