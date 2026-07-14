/**
 * Curated closed-set enums for Quadlet keys whose values are known, finite
 * vocabularies. This table is hand-curated and deliberately conservative: a
 * key only appears here when we are confident the value set is closed and
 * documented by Podman. Omission is the safe default — an undocumented key
 * simply never gets enum-checked, rather than risk a false positive against
 * a value a newer Podman version might accept.
 */

/**
 * systemd-style boolean literals, shared by every Quadlet key documented as
 * accepting a boolean. Includes the numeric and on/off spellings systemd
 * itself accepts, not just true/false.
 */
const BOOLEAN_VALUES: ReadonlySet<string> = new Set([
  "true",
  "false",
  "yes",
  "no",
  "on",
  "off",
  "1",
  "0",
]);

export const SECTION_ENUMS: Readonly<Record<string, Readonly<Record<string, ReadonlySet<string>>>>> =
  {
    Container: {
      Pull: new Set(["always", "missing", "never", "newer"]), // source: podman-run --pull
      ImageVolume: new Set(["bind", "tmpfs", "ignore"]), // source: podman-run --image-volume
      NoNewPrivileges: BOOLEAN_VALUES, // source: Quadlet boolean parsing (systemd-style booleans incl. 1/0)
      ReadOnly: BOOLEAN_VALUES, // source: Quadlet boolean parsing (systemd-style booleans incl. 1/0)
      RunInit: BOOLEAN_VALUES, // source: Quadlet boolean parsing (systemd-style booleans incl. 1/0)
    },
    Network: {
      Internal: BOOLEAN_VALUES, // source: Quadlet boolean parsing (systemd-style booleans incl. 1/0)
      DisableDNS: BOOLEAN_VALUES, // source: Quadlet boolean parsing (systemd-style booleans incl. 1/0)
      IPv6: BOOLEAN_VALUES, // source: Quadlet boolean parsing (systemd-style booleans incl. 1/0)
      NetworkDeleteOnStop: BOOLEAN_VALUES, // source: Quadlet boolean parsing (systemd-style booleans incl. 1/0)
    },
    Pod: {
      ExitPolicy: new Set(["continue", "stop"]), // source: podman-pod-create --exit-policy
    },
    Kube: {
      ExitCodePropagation: new Set(["all", "any", "none"]), // source: podman-kube-play --exit-code-propagation
    },
  };
