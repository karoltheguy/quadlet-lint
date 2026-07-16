/**
 * Curated set of mutually exclusive key pairs, per section. This table is
 * hand-curated and deliberately conservative: a pair only appears here when
 * we are confident Podman's Quadlet generator genuinely refuses to generate
 * a unit when both keys are set. Omission is the safe default: an
 * undocumented conflict simply never gets flagged, rather than risk a false
 * positive against a combination a newer Podman version might allow.
 */

/** A pair of mutually exclusive keys within a single section. */
interface ConflictPair {
  keys: readonly [string, string];
}

export const SECTION_CONFLICTS: Readonly<Record<string, readonly ConflictPair[]>> = {
  Container: [
    {
      // source: podman pkg/systemd/quadlet/quadlet.go, ConvertContainer:
      // fmt.Errorf("the Image And Rootfs keys conflict can not be specified together")
      keys: ["Image", "Rootfs"],
    },
    {
      // source: podman pkg/systemd/quadlet/quadlet.go, ConvertContainer:
      // fmt.Errorf("%s and %s are mutually exclusive but both are set", KeyReloadCmd, KeyReloadSignal)
      keys: ["ReloadCmd", "ReloadSignal"],
    },
  ],
};
