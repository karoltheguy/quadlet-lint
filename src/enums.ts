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

/**
 * Deliberately excluded keys — do not re-add without re-litigating this
 * decision. Each of these either defers its value validation entirely to
 * Podman (the value space is open-ended, plugin-defined, or host-dependent)
 * or carries non-literal pattern values rather than a closed enum, so
 * treating them as closed sets here would break the zero-false-positive
 * promise of QL040:
 *   - AutoUpdate: pattern-valued (`name` or `name/(local|registry)`), not a
 *     literal enum.
 *   - Notify: defers to Podman's own `--sdnotify` handling and container
 *     runtime behavior.
 *   - LogDriver: defers to Podman/conmon's supported log drivers, which can
 *     grow without a Quadlet release.
 *   - CgroupsMode: defers to Podman's cgroup management modes.
 *   - Policy (Image): defers to Podman's pull-policy semantics beyond the
 *     literal values already covered by Container.Pull.
 *   - HealthOnFailure: defers to Podman's health-check action set.
 *   - Volume.Driver: open-ended (`local` plus arbitrary third-party volume
 *     plugins), unlike Network.Driver which is a small closed set.
 */

export const SECTION_ENUMS: Readonly<Record<string, Readonly<Record<string, ReadonlySet<string>>>>> =
  {
    Container: {
      Pull: new Set(["always", "missing", "never", "newer"]), // source: podman-run --pull
      ImageVolume: new Set(["bind", "tmpfs", "ignore"]), // source: podman-run --image-volume
      NoNewPrivileges: BOOLEAN_VALUES, // source: Quadlet boolean parsing (systemd-style booleans incl. 1/0)
      ReadOnly: BOOLEAN_VALUES, // source: Quadlet boolean parsing (systemd-style booleans incl. 1/0)
      RunInit: BOOLEAN_VALUES, // source: Quadlet boolean parsing (systemd-style booleans incl. 1/0)
      ReadOnlyTmpfs: BOOLEAN_VALUES, // source: podman-systemd.unit(5) ReadOnlyTmpfs= "If ReadOnly is set to true, ..." (documented true/false)
      StartWithPod: BOOLEAN_VALUES, // source: podman-systemd.unit(5) StartWithPod= "Default to true" (documented true/false)
      EnvironmentHost: BOOLEAN_VALUES, // source: podman-systemd.unit(5) EnvironmentHost=true/false
    },
    Network: {
      Driver: new Set(["bridge", "macvlan", "ipvlan"]), // source: podman-systemd.unit(5) Driver= "Currently bridge, macvlan and ipvlan are supported"
      IPAMDriver: new Set(["host-local", "dhcp", "none"]), // source: podman-systemd.unit(5) IPAMDriver= "Currently host-local, dhcp and none are supported"
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
    Volume: {
      Copy: BOOLEAN_VALUES, // source: podman-systemd.unit(5) Copy=yes/no
    },
    Build: {
      ForceRM: BOOLEAN_VALUES, // source: podman-systemd.unit(5) ForceRM= "... (default true)" (documented true/false)
      TLSVerify: BOOLEAN_VALUES, // source: podman-systemd.unit(5) Build TLSVerify=yes/no
    },
    Image: {
      AllTags: BOOLEAN_VALUES, // source: podman-systemd.unit(5) AllTags=yes/no
      TLSVerify: BOOLEAN_VALUES, // source: podman-systemd.unit(5) Image TLSVerify=yes/no
    },
  };
