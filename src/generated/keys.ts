// AUTO-GENERATED — do not edit by hand.
// Source: References/podman-systemd.unit.5.md
// Upstream: https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html
// Regenerate with: npm run gen:keys (after refreshing References/ from upstream)
// Generated: 2026-07-13

export interface SectionKeys {
  /** Every key documented as valid in this section. */
  valid: ReadonlySet<string>;
  /** Keys proven single-valued (a duplicate is a mistake). Keys of unknown
   *  repeatability are intentionally omitted so they are never flagged. */
  singleValue: ReadonlySet<string>;
}

/** Key data for the Quadlet-specific sections, keyed by section name. */
export const SECTION_KEYS: Readonly<Record<string, SectionKeys>> = {
  Container: {
    valid: new Set(["AddCapability", "AddDevice", "AddHost", "Annotation", "AppArmor", "AutoUpdate", "CgroupsMode", "ContainerName", "ContainersConfModule", "DNS", "DNSOption", "DNSSearch", "DropCapability", "Entrypoint", "Environment", "EnvironmentFile", "EnvironmentHost", "Exec", "ExposeHostPort", "GIDMap", "GlobalArgs", "Group", "GroupAdd", "HealthCmd", "HealthInterval", "HealthLogDestination", "HealthMaxLogCount", "HealthMaxLogSize", "HealthOnFailure", "HealthRetries", "HealthStartPeriod", "HealthStartupCmd", "HealthStartupInterval", "HealthStartupRetries", "HealthStartupSuccess", "HealthStartupTimeout", "HealthTimeout", "HostName", "HttpProxy", "Image", "ImageVolume", "IP", "IP6", "Label", "LogDriver", "LogOpt", "Mask", "Memory", "Mount", "Network", "NetworkAlias", "NoNewPrivileges", "Notify", "PidsLimit", "Pod", "PodmanArgs", "PublishPort", "Pull", "ReadOnly", "ReadOnlyTmpfs", "ReloadCmd", "ReloadSignal", "Retry", "RetryDelay", "Rootfs", "RunInit", "SeccompProfile", "Secret", "SecurityLabelDisable", "SecurityLabelFileType", "SecurityLabelLevel", "SecurityLabelNested", "SecurityLabelType", "ServiceName", "ShmSize", "StartWithPod", "StopSignal", "StopTimeout", "SubGIDMap", "SubUIDMap", "Sysctl", "Timezone", "Tmpfs", "UIDMap", "Ulimit", "Unmask", "User", "UserNS", "Volume", "WorkingDir"]),
    singleValue: new Set(["AppArmor", "AutoUpdate", "CgroupsMode", "ContainerName", "Entrypoint", "EnvironmentHost", "Exec", "Group", "GroupAdd", "HealthCmd", "HealthInterval", "HealthLogDestination", "HealthMaxLogCount", "HealthMaxLogSize", "HealthOnFailure", "HealthRetries", "HealthStartPeriod", "HealthStartupCmd", "HealthStartupInterval", "HealthStartupRetries", "HealthStartupSuccess", "HealthStartupTimeout", "HealthTimeout", "HostName", "HttpProxy", "Image", "ImageVolume", "IP", "IP6", "LogDriver", "Mask", "Memory", "NoNewPrivileges", "Notify", "PidsLimit", "Pod", "Pull", "ReadOnly", "ReadOnlyTmpfs", "ReloadCmd", "ReloadSignal", "Retry", "RetryDelay", "Rootfs", "RunInit", "SeccompProfile", "Secret", "SecurityLabelDisable", "SecurityLabelFileType", "SecurityLabelLevel", "SecurityLabelNested", "SecurityLabelType", "ServiceName", "ShmSize", "StartWithPod", "StopSignal", "StopTimeout", "SubGIDMap", "SubUIDMap", "Timezone", "Unmask", "User", "UserNS", "WorkingDir"]),
  },
  Pod: {
    valid: new Set(["AddHost", "ContainersConfModule", "DNS", "DNSOption", "DNSSearch", "ExitPolicy", "GIDMap", "GlobalArgs", "HostName", "IP", "IP6", "Label", "Network", "NetworkAlias", "PodmanArgs", "PodName", "PublishPort", "ServiceName", "ShmSize", "StopTimeout", "SubGIDMap", "SubUIDMap", "UIDMap", "UserNS", "Volume"]),
    singleValue: new Set(["ExitPolicy", "HostName", "IP", "IP6", "PodName", "ServiceName", "ShmSize", "StopTimeout", "SubGIDMap", "SubUIDMap", "UserNS"]),
  },
  Kube: {
    valid: new Set(["AutoUpdate", "ConfigMap", "ContainersConfModule", "ExitCodePropagation", "GlobalArgs", "KubeDownForce", "LogDriver", "Network", "PodmanArgs", "PublishPort", "ServiceName", "SetWorkingDirectory", "UserNS", "Yaml"]),
    singleValue: new Set(["ExitCodePropagation", "KubeDownForce", "LogDriver", "ServiceName", "SetWorkingDirectory", "UserNS"]),
  },
  Network: {
    valid: new Set(["ContainersConfModule", "DisableDNS", "DNS", "Driver", "Gateway", "GlobalArgs", "InterfaceName", "Internal", "IPAMDriver", "IPRange", "IPv6", "Label", "NetworkDeleteOnStop", "NetworkName", "Options", "PodmanArgs", "ServiceName", "Subnet"]),
    singleValue: new Set(["DisableDNS", "Driver", "InterfaceName", "Internal", "IPAMDriver", "IPv6", "NetworkDeleteOnStop", "NetworkName", "Options", "ServiceName"]),
  },
  Volume: {
    valid: new Set(["ContainersConfModule", "Copy", "Device", "Driver", "GID", "GlobalArgs", "Group", "Image", "Label", "Options", "PodmanArgs", "ServiceName", "Type", "UID", "User", "VolumeName"]),
    singleValue: new Set(["Copy", "Device", "Driver", "GID", "Group", "Image", "Options", "ServiceName", "Type", "UID", "User", "VolumeName"]),
  },
  Build: {
    valid: new Set(["Annotation", "Arch", "AuthFile", "BuildArg", "ContainersConfModule", "DNS", "DNSOption", "DNSSearch", "Environment", "File", "ForceRM", "GlobalArgs", "GroupAdd", "IgnoreFile", "ImageTag", "Label", "Network", "PodmanArgs", "Pull", "Retry", "RetryDelay", "Secret", "ServiceName", "SetWorkingDirectory", "Target", "TLSVerify", "Variant", "Volume"]),
    singleValue: new Set([]),
  },
  Image: {
    valid: new Set(["AllTags", "Arch", "AuthFile", "CertDir", "ContainersConfModule", "Creds", "DecryptionKey", "GlobalArgs", "Image", "ImageTag", "OS", "PodmanArgs", "Policy", "Retry", "RetryDelay", "ServiceName", "TLSVerify", "Variant"]),
    singleValue: new Set([]),
  },
  Artifact: {
    valid: new Set(["Artifact", "AuthFile", "CertDir", "ContainersConfModule", "Creds", "DecryptionKey", "GlobalArgs", "PodmanArgs", "Quiet", "Retry", "RetryDelay", "ServiceName", "TLSVerify"]),
    singleValue: new Set([]),
  },
  Quadlet: {
    valid: new Set(["DefaultDependencies", "CacheDirectory", "ExecStartPre", "Device", "Type", "VolumeName", "Options"]),
    singleValue: new Set([]),
  },
};
