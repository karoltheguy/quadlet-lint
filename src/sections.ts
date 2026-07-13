/**
 * Static knowledge about Quadlet unit files.
 *
 * Quadlet files are systemd units, so they share the standard systemd sections
 * ([Unit], [Service], [Install]) and add Quadlet-specific ones per file type
 * (.container -> [Container], .pod -> [Pod], etc.).
 *
 * Everything here is intentionally conservative: we only encode facts we are
 * confident about, so the linter can keep its "zero false errors" promise.
 */

/**
 * Sections systemd / Quadlet understand. Anything else is either a typo or a
 * user-defined `X-` section (which systemd explicitly allows and ignores).
 */
export const KNOWN_SECTIONS: ReadonlySet<string> = new Set([
  // Standard systemd sections, valid in any unit file.
  "Unit",
  "Service",
  "Install",
  // Quadlet file-type sections.
  "Container",
  "Pod",
  "Network",
  "Volume",
  "Kube",
  "Build",
  "Image",
]);

/**
 * systemd convention: sections whose name starts with `X-` are reserved for
 * private use and are never rejected. We must not flag them as unknown.
 */
export function isUserDefinedSection(name: string): boolean {
  return name.startsWith("X-");
}

/**
 * Keys that are single-valued ("last one wins") — repeating them is almost
 * always a mistake. This set is intentionally curated and incomplete: only keys
 * we are confident are NOT list/append keys belong here.
 *
 * The safety argument: a key we omit here is simply never flagged for
 * duplicates (a missed hint, which is fine — the linter is convenience, not a
 * verdict). A key we wrongly include would produce a false positive on a value
 * that legitimately repeats, which we refuse to do. When in doubt, leave it out.
 *
 * Keyed by section name. Key comparison is case-sensitive, matching systemd.
 */
export const SINGLE_VALUE_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  Container: new Set([
    "Image",
    "ContainerName",
    "Exec",
    "EntryPoint",
    "Pod",
    "User",
    "Group",
    "WorkingDir",
    "UserNS",
    "HostName",
    "RunInit",
    "ReadOnly",
    "ReadOnlyTmpfs",
    "Notify",
    "Timezone",
    "StopSignal",
    "StopTimeout",
    "Pull",
    "LogDriver",
    "AutoUpdate",
    "Rootfs",
    "IP",
    "IP6",
    "ShmSize",
    "NoNewPrivileges",
  ]),
  Pod: new Set([
    "PodName",
  ]),
  Volume: new Set([
    "VolumeName",
    "Driver",
    "Type",
    "Device",
    "Copy",
  ]),
  Network: new Set([
    "NetworkName",
    "Driver",
    "IPv6",
    "Internal",
    "Gateway",
    "Subnet",
    "IPRange",
    "DisableDNS",
  ]),
  Build: new Set([
    "ImageTag",
    "File",
    "SetWorkingDirectory",
  ]),
  Image: new Set([
    "Image",
    "ImageTag",
    "AllTags",
    "OS",
    "Arch",
    "Variant",
  ]),
  Kube: new Set([
    "Yaml",
    "ConfigMap",
    "LogDriver",
    "KubeDownForce",
  ]),
};

/**
 * Whether `key` in `section` is known to be single-valued (and therefore a
 * candidate for duplicate-key warnings).
 */
export function isSingleValueKey(section: string, key: string): boolean {
  return SINGLE_VALUE_KEYS[section]?.has(key) ?? false;
}
