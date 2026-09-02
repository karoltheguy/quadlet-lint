/**
 * Options Podman 6.0 removed, for the QL084 warning.
 *
 * source: Podman v6.0.0 release notes -
 *   "Support for CNI networking has been removed. Please use Netavark instead."
 *   "Support for the slirp4netns rootless network stack has been removed.
 *    Please use Pasta instead. As part of this, the `--network-cmd-path`
 *    global option, only used with `slirp4netns`, has been removed."
 *
 * Unit files using these keep working on Podman 5 and stop working on 6, so
 * every check here is a warning and never an error.
 *
 * CNI is deliberately NOT detected. A CNI network is referenced by plain name
 * (`Network=mynet`), which is byte-identical to a Netavark reference, so no
 * signal in the unit file distinguishes them. Flagging it would break the
 * zero-false-positive promise the value checks are built on, so the removal is
 * documented here and left unchecked.
 */

/**
 * The section+key pairs whose value is passed to `podman --network` and can
 * therefore name the removed slirp4netns stack.
 *
 * source: podman-systemd.unit(5) - the documented Network= key
 * (Container.Network, Pod.Network, Kube.Network).
 */
export const REMOVED_NETWORK_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  Container: new Set(["Network"]),
  Pod: new Set(["Network"]),
  Kube: new Set(["Network"]),
};

/**
 * The keys carrying raw Podman command-line arguments, where the removed
 * `--network-cmd-path` global option can appear.
 *
 * source: podman-systemd.unit(5) - GlobalArgs= and PodmanArgs= are documented
 * as passing arguments straight through to Podman.
 */
export const REMOVED_ARG_KEYS: ReadonlySet<string> = new Set(["PodmanArgs", "GlobalArgs"]);

/**
 * Whether `value` names the slirp4netns network stack removed in Podman 6.0.
 *
 * Zero-false-positive rationale: `podman --network` accepted either the bare
 * `slirp4netns` or the parameterized `slirp4netns:<options>` form, and both
 * were removed wholesale. Matching is anchored at the start and requires the
 * value to be exactly the token or the token followed by `:`, so a Netavark
 * network merely named after it (`my-slirp4netns-clone.network`) is never
 * flagged. Comparison is case-insensitive, matching QL040's treatment of
 * documented value vocabularies.
 */
export function isRemovedNetworkValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "slirp4netns" || v.startsWith("slirp4netns:");
}

/**
 * Whether `value` passes the `--network-cmd-path` global option removed in
 * Podman 6.0 alongside slirp4netns.
 *
 * Zero-false-positive rationale: the option is matched as a whole word, so it
 * must be preceded by the start of the value or whitespace and followed by
 * `=`, whitespace, or the end. A longer flag that merely starts with the same
 * characters is therefore never flagged.
 */
export function hasRemovedArg(value: string): boolean {
  return /(^|\s)--network-cmd-path(=|\s|$)/.test(value);
}
