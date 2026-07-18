/**
 * Curated tables of required keys, per section, for Podman's Quadlet
 * generator. Like `conflicts.ts`, these tables are hand-curated and
 * deliberately conservative: an entry only appears here when we are
 * confident Podman's Quadlet generator genuinely returns an error (no unit
 * is produced at all) when the requirement is unmet. Omission is the safe
 * default: an undocumented requirement simply never gets flagged, rather
 * than risk a false positive against a combination a newer Podman version
 * might allow.
 */

/** A single key that must be present with a non-empty value. */
export interface PlainRequired {
  key: string;
}

/** A group of keys where at least one must be present with a non-empty value. */
export interface OneOfRequired {
  keys: readonly string[];
}

/** The required-key rules for one section. */
export interface SectionRequirements {
  plain?: readonly PlainRequired[];
  oneOf?: readonly OneOfRequired[];
}

export const SECTION_REQUIRED: Readonly<Record<string, SectionRequirements>> = {
  Kube: {
    plain: [
      {
        // source: podman pkg/systemd/quadlet/quadlet.go, ConvertKube:
        // fmt.Errorf("no Yaml key specified")
        key: "Yaml",
      },
    ],
  },
  Build: {
    plain: [
      {
        // source: podman pkg/systemd/quadlet/quadlet.go, ConvertBuild:
        // fmt.Errorf("no ImageTag key specified")
        key: "ImageTag",
      },
    ],
    oneOf: [
      {
        // source: podman pkg/systemd/quadlet/quadlet.go, ConvertBuild:
        // fmt.Errorf("neither SetWorkingDirectory, nor File key specified")
        keys: ["File", "SetWorkingDirectory"],
      },
    ],
  },
  Artifact: {
    plain: [
      {
        // source: podman pkg/systemd/quadlet/quadlet.go, ConvertArtifact:
        // !ok || len(artifactName) == 0 -> fmt.Errorf("no Artifact key specified")
        key: "Artifact",
      },
    ],
  },
  Container: {
    oneOf: [
      {
        // source: podman pkg/systemd/quadlet/quadlet.go, ConvertContainer:
        // len(image) == 0 && len(rootfs) == 0 -> fmt.Errorf("no Image or Rootfs key specified")
        keys: ["Image", "Rootfs"],
      },
    ],
  },
  Image: {
    plain: [
      {
        // source: podman pkg/systemd/quadlet/quadlet.go, ConvertImage:
        // imageName, ok := image.Lookup(ImageGroup, KeyImage); if !ok || len(imageName) == 0
        // -> fmt.Errorf("no Image key specified")
        key: "Image",
      },
    ],
  },
};

/**
 * A requirement that only applies once some trigger condition holds within
 * the section. `triggers` is evaluated against the last-wins bookkeeping for
 * every key seen in the section (mirroring how `seenConflictKeys` treats a
 * later empty assignment as unsetting an earlier value).
 */
export interface ConditionalRequirement {
  /** Human-readable statement of the trigger condition, used in diagnostic messages. */
  triggerDescription: string;
  /** Whether this requirement is triggered, given the section's key bookkeeping. */
  triggers(lastValue: ReadonlyMap<string, string>, lastNonEmpty: ReadonlyMap<string, boolean>): boolean;
  /** The key required once triggered. */
  requiredKey: string;
  /**
   * Whether mere presence of `requiredKey` (any value, including an empty
   * one) satisfies the requirement, as opposed to requiring a non-empty
   * value.
   */
  presenceOnly: boolean;
}

export const SECTION_CONDITIONAL: Readonly<Record<string, readonly ConditionalRequirement[]>> = {
  Volume: [
    {
      // source: podman pkg/systemd/quadlet/quadlet.go, ConvertVolume:
      // if driver == "image" { if _, ok := volume.Lookup("Image"); !ok {
      //   return nil, fmt.Errorf("the key Image is mandatory when using the image driver") } }
      // The comparison is a plain Go `==` against the exact string "image",
      // so it is case-sensitive: "Image" or "IMAGE" does not trigger this.
      triggerDescription: "Driver=image",
      triggers: (lastValue) => lastValue.get("Driver") === "image",
      requiredKey: "Image",
      // Go only checks `!ok` (was the key looked up at all), never the
      // length of the value, so a present-but-empty Image= satisfies this.
      presenceOnly: true,
    },
    {
      // source: podman pkg/systemd/quadlet/quadlet.go, ConvertVolume: the
      // Type lookup (`ok && len(devType) != 0`) sits in the else-branch of
      // `if driver == "image"`, so under Driver=image (exact, case-sensitive
      // Go `==`) this check is never reached; otherwise a non-empty Type
      // without a non-empty Device -> fmt.Errorf("key Type can't be used
      // without Device")
      triggerDescription: "Type= without Driver=image",
      triggers: (lastValue, lastNonEmpty) =>
        lastNonEmpty.get("Type") === true && lastValue.get("Driver") !== "image",
      requiredKey: "Device",
      presenceOnly: false,
    },
  ],
  Container: [
    {
      // source: podman pkg/systemd/quadlet/quadlet.go, handleUser (called
      // from ConvertContainer): okUser := hasUser && len(user) > 0; a
      // non-empty Group with an absent-or-empty User
      // -> fmt.Errorf("invalid Group set without User")
      triggerDescription: "Group=",
      triggers: (_lastValue, lastNonEmpty) => lastNonEmpty.get("Group") === true,
      requiredKey: "User",
      presenceOnly: false,
    },
  ],
  Build: [
    {
      // source: podman pkg/systemd/quadlet/quadlet.go,
      // handleSetWorkingDirectory (called from ConvertBuild):
      // switch strings.ToLower(setWorkingDirectory) { case "file": ...
      //   Lookup(quadletGroup, KeyFile); if !ok -> fmt.Errorf("no File key specified") }
      // The value match is case-insensitive because Go lowercases it first;
      // the lookup itself only checks `!ok`, so it is presence-only.
      triggerDescription: "SetWorkingDirectory=file",
      triggers: (lastValue) => (lastValue.get("SetWorkingDirectory") ?? "").toLowerCase() === "file",
      requiredKey: "File",
      presenceOnly: true,
    },
  ],
  Network: [
    {
      // source: podman pkg/systemd/quadlet/quadlet.go, ConvertNetwork:
      //   if len(subnets) > 0 {
      //     ...
      //   } else if len(ipRanges) > 0 || len(gateways) > 0 {
      //     return nil, warnings, fmt.Errorf("cannot set gateway or range without subnet")
      //   }
      // i.e. any Gateway/IPRange with no Subnet at all fails generation.
      triggerDescription: "Gateway= or IPRange=",
      triggers: (_lastValue, lastNonEmpty) =>
        lastNonEmpty.get("Gateway") === true || lastNonEmpty.get("IPRange") === true,
      requiredKey: "Subnet",
      // Go reads Gateway/IPRange/Subnet here via LookupAll, whose exact
      // empty-value behavior can't be confirmed from the source alone. We
      // deliberately choose the option that never over-reports: requiring
      // only PRESENCE of Subnet= (not non-emptiness) means a case where an
      // empty Subnet= would still actually fail generation goes unflagged,
      // but that is the safe direction, silence over a false positive.
      presenceOnly: true,
    },
  ],
};
