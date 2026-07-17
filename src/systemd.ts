/**
 * Static knowledge about the standard systemd sections ([Unit], [Service],
 * [Install]) that every Quadlet-generated unit file shares.
 *
 * Unlike the Quadlet-specific sections in `sections.ts` / `generated/keys.ts`,
 * we deliberately do NOT validate keys here (no `singleValue` set, no
 * unknown-key diagnostics): the standard systemd key surface is huge, still
 * growing, and the linter's "zero false errors" promise means we would rather
 * stay silent than wrongly flag a valid-but-uncommon directive as a typo.
 * This module only powers editor affordances (completions, hover), never
 * diagnostics.
 *
 * The [Service] key list is scoped to systemd.service(5) directives only. It
 * intentionally excludes the much larger systemd.exec(5) / systemd.kill(5) /
 * systemd.resource-control(5) surface (e.g. `User=`, `WorkingDirectory=`,
 * `KillSignal=`, `MemoryMax=`) that a [Service] section may also contain --
 * that surface is out of scope for this pass and can be added later.
 */

/** Key data for one standard systemd section. */
export interface SystemdSectionKeys {
  /** Every key documented as valid in this section (per the relevant man page). */
  valid: ReadonlySet<string>;
  /** Hand-written one-to-two-sentence descriptions for the most common keys,
   *  for hover. Keys not in this table simply have no hover description. */
  descriptions: Readonly<Record<string, string>>;
}

/** Key data for the standard systemd sections, keyed by section name. */
export const SYSTEMD_KEYS: Readonly<Record<string, SystemdSectionKeys>> = {
  Unit: {
    valid: new Set([
      "Description", "Documentation", "Wants", "Requires", "Requisite", "BindsTo", "PartOf",
      "Upholds", "Conflicts", "Before", "After", "OnFailure", "OnSuccess", "PropagatesReloadTo",
      "ReloadPropagatedFrom", "PropagatesStopTo", "StopPropagatedFrom", "JoinsNamespaceOf",
      "RequiresMountsFor", "WantsMountsFor", "OnSuccessJobMode", "OnFailureJobMode",
      "IgnoreOnIsolate", "StopWhenUnneeded", "RefuseManualStart", "RefuseManualStop",
      "AllowIsolate", "DefaultDependencies", "SurviveFinalKillSignal", "CollectMode",
      "FailureAction", "SuccessAction", "FailureActionExitStatus", "SuccessActionExitStatus",
      "JobTimeoutSec", "JobRunningTimeoutSec", "JobTimeoutAction", "JobTimeoutRebootArgument",
      "StartLimitIntervalSec", "StartLimitBurst", "StartLimitAction", "RebootArgument",
      "SourcePath",
      "ConditionArchitecture", "ConditionFirmware", "ConditionVirtualization", "ConditionHost",
      "ConditionKernelCommandLine", "ConditionKernelVersion", "ConditionCredential",
      "ConditionEnvironment", "ConditionSecurity", "ConditionCapability", "ConditionACPower",
      "ConditionNeedsUpdate", "ConditionFirstBoot", "ConditionPathExists",
      "ConditionPathExistsGlob", "ConditionPathIsDirectory", "ConditionPathIsSymbolicLink",
      "ConditionPathIsMountPoint", "ConditionPathIsReadWrite", "ConditionPathIsEncrypted",
      "ConditionDirectoryNotEmpty", "ConditionFileNotEmpty", "ConditionFileIsExecutable",
      "ConditionUser", "ConditionGroup", "ConditionControlGroupController", "ConditionMemory",
      "ConditionCPUs", "ConditionCPUFeature", "ConditionOSRelease", "ConditionMemoryPressure",
      "ConditionCPUPressure", "ConditionIOPressure",
      "AssertArchitecture", "AssertFirmware", "AssertVirtualization", "AssertHost",
      "AssertKernelCommandLine", "AssertKernelVersion", "AssertCredential",
      "AssertEnvironment", "AssertSecurity", "AssertCapability", "AssertACPower",
      "AssertNeedsUpdate", "AssertFirstBoot", "AssertPathExists",
      "AssertPathExistsGlob", "AssertPathIsDirectory", "AssertPathIsSymbolicLink",
      "AssertPathIsMountPoint", "AssertPathIsReadWrite", "AssertPathIsEncrypted",
      "AssertDirectoryNotEmpty", "AssertFileNotEmpty", "AssertFileIsExecutable",
      "AssertUser", "AssertGroup", "AssertControlGroupController", "AssertMemory",
      "AssertCPUs", "AssertCPUFeature", "AssertOSRelease", "AssertMemoryPressure",
      "AssertCPUPressure", "AssertIOPressure",
    ]),
    descriptions: {
      "Description": "A free-form string describing the unit. This is used by systemd (and tools that display it) as the human-readable identifier for the unit, shown for example in `systemctl status`.",
      "Documentation": "A list of URIs referencing documentation for the unit, such as `man:` or `https:` links.",
      "Requires": "Configures dependencies on other units that must be activated alongside this one. If any listed unit fails to start, this unit is not started either.",
      "Wants": "A weaker version of `Requires`: configures units to activate alongside this one, but without causing this unit to fail if they fail or cannot be started.",
      "BindsTo": "A stronger version of `Requires`: if the bound-to unit stops, this unit stops too, in addition to the normal ordering and requirement behavior.",
      "PartOf": "Configures dependencies similar to `Requires`, but limited to stopping and restarting: if the listed units are stopped or restarted, this unit is too, but not vice versa.",
      "Conflicts": "Configures negative dependencies: starting this unit stops the listed units, and vice versa.",
      "Before": "Orders this unit before the listed units, without introducing a dependency (use together with `Requires`/`Wants` to actually pull in the other unit).",
      "After": "Orders this unit after the listed units, without introducing a dependency (use together with `Requires`/`Wants` to actually pull in the other unit).",
      "OnFailure": "A list of units that are activated when this unit enters a failed state.",
      "StartLimitIntervalSec": "Configures a rate limit on how often this unit can be activated within a given time interval. If the unit is started more often than allowed, it is not permitted to start again until the interval passes.",
      "StartLimitBurst": "The number of allowed start attempts within the `StartLimitIntervalSec` interval before the rate limit is triggered.",
      "ConditionPathExists": "Checks for the existence of a file before starting the unit. If the path does not exist, the unit is skipped (not treated as failed) unless the condition is prefixed with `|`.",
    },
  },
  Service: {
    valid: new Set([
      "Type", "ExitType", "RemainAfterExit", "GuessMainPID", "PIDFile", "BusName", "ExecStart",
      "ExecStartPre", "ExecStartPost", "ExecCondition", "ExecReload", "ExecStop", "ExecStopPost",
      "RestartSec", "RestartSteps", "RestartMaxDelaySec", "TimeoutStartSec", "TimeoutStopSec",
      "TimeoutAbortSec", "TimeoutSec", "TimeoutStartFailureMode", "TimeoutStopFailureMode",
      "RuntimeMaxSec", "RuntimeRandomizedExtraSec", "Restart", "RestartMode",
      "SuccessExitStatus", "RestartPreventExitStatus", "RestartForceExitStatus",
      "RootDirectoryStartOnly", "NonBlocking", "NotifyAccess", "Sockets",
      "FileDescriptorStoreMax", "FileDescriptorStorePreserve", "USBFunctionDescriptors",
      "USBFunctionStrings", "OOMPolicy", "OpenFile", "ReloadSignal",
    ]),
    descriptions: {
      "Type": "Configures the mechanism by which the service notifies the manager that its startup has finished. Common values are `simple`, `forking`, `oneshot`, `notify`, and `dbus`.",
      "ExecStart": "Command lines that are executed when this service is started. Takes a full command line, resolved relative to `WorkingDirectory` if not absolute.",
      "ExecStartPre": "Additional command lines executed before `ExecStart`. Failure of an `ExecStartPre` command (unless prefixed with `-`) causes the service to fail before `ExecStart` runs.",
      "ExecStop": "Command lines executed to stop the service started via `ExecStart`. If not specified, the service is stopped by sending `SIGTERM` to its processes.",
      "ExecReload": "Command lines executed to trigger a configuration reload of the service, e.g. in response to `systemctl reload`.",
      "Restart": "Configures whether the service is restarted when its process exits, is killed, or times out. Common values are `no`, `on-failure`, and `always`.",
      "RestartSec": "The time to sleep before restarting a service, when `Restart` is enabled and applicable.",
      "TimeoutStartSec": "The time to wait for start-up before considering the service failed and stopping it again.",
      "TimeoutStopSec": "The time to wait for stop before the service is terminated forcibly with `SIGTERM`, and after another delay with `SIGKILL`.",
      "RemainAfterExit": "Whether the service is considered active even after all of its processes exited, typically used for `Type=oneshot` services.",
      "PIDFile": "A path, relative to the service's root directory if not absolute, pointing to the PID file of this service, used to determine the main process.",
      "NotifyAccess": "Controls access to the service status notification socket (used with `Type=notify`), i.e. which processes are allowed to send `sd_notify()` messages.",
      "OOMPolicy": "Configures the out-of-memory (OOM) killer policy for the processes of this unit, e.g. `continue`, `stop`, or `kill`.",
    },
  },
  Install: {
    valid: new Set(["Alias", "WantedBy", "RequiredBy", "UpheldBy", "Also", "DefaultInstance"]),
    descriptions: {
      "WantedBy": "The primary way to hook a unit into the start-up of another (usually a target unit): when this unit is enabled, a symlink is created so the listed unit gains a `Wants` dependency on it.",
      "RequiredBy": "Like `WantedBy`, but creates a `Requires` dependency from the listed unit onto this one instead of a `Wants` dependency.",
      "UpheldBy": "Like `WantedBy`, but creates an `Upholds` dependency from the listed unit onto this one instead of a `Wants` dependency.",
      "Alias": "Additional names this unit shall be installed under. The names listed here must have the same suffix (i.e. type) as the unit file name.",
      "Also": "Additional units to install/deinstall alongside this unit, when the user runs `systemctl enable`/`disable` on it.",
      "DefaultInstance": "For template units, the default instance name to use if the unit is enabled without specifying one explicitly.",
    },
  },
};

/**
 * Whether we have curated key data for `section` (i.e. it is one of the
 * standard systemd sections: [Unit], [Service], [Install]).
 */
export function hasSystemdKeyData(section: string): boolean {
  return section in SYSTEMD_KEYS;
}

/**
 * Whether `key` is a documented valid key for the standard systemd `section`.
 * Only meaningful when {@link hasSystemdKeyData} is true. Comparison is
 * case-sensitive, matching systemd.
 */
export function isKnownSystemdKey(section: string, key: string): boolean {
  return SYSTEMD_KEYS[section]?.valid.has(key) ?? false;
}

/**
 * The set of documented valid keys for the standard systemd `section`, if we
 * have curated key data for it (see {@link hasSystemdKeyData}). Returns
 * undefined otherwise.
 */
export function getSystemdSectionKeys(section: string): ReadonlySet<string> | undefined {
  return SYSTEMD_KEYS[section]?.valid;
}

/**
 * The documentation description for `key` in the standard systemd `section`,
 * if we have one. Returns null when the section has no key data, the key is
 * unknown, or the key has no curated description.
 */
export function getSystemdKeyDescription(section: string, key: string): string | null {
  return SYSTEMD_KEYS[section]?.descriptions[key] ?? null;
}
