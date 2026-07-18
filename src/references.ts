/**
 * Curated tables describing which keys, in which sections, Podman's Quadlet
 * generator resolves as references to *other* unit files (as opposed to
 * plain strings, filesystem paths, or opaque option blobs). Like
 * `required.ts` and `conflicts.ts`, this table is hand-curated and
 * deliberately conservative: an entry only appears here when we are
 * confident Podman's generator genuinely performs a unit lookup for that key
 * and fails when it comes up empty. Omission is the safe default — a value
 * we don't recognize as a reference is simply never checked, rather than
 * risk a false positive against a key/shape we haven't confirmed.
 */

/** A single key, within a section, that can reference another unit file. */
export interface ReferenceKey {
  key: string;
  /**
   * Whether this key is single-valued and last-wins (only the final
   * occurrence in the section matters), as opposed to multi-valued where
   * every occurrence is checked independently.
   */
  lastWins: boolean;
  /**
   * Given the raw (trimmed) value of one occurrence of this key, returns the
   * referenced unit's basename (e.g. "app.pod"), or null if this particular
   * value is not a unit reference (e.g. a bare destination-only Volume=, or
   * a filesystem path).
   */
  extractRef(value: string): string | null;
}

/**
 * source: podman pkg/systemd/quadlet/quadlet.go, handlePod (called only from
 * ConvertContainer): `pod, ok := lookupAndAddString(...)`; last-wins, and a
 * last empty value disables the check entirely (`ok && len(pod) > 0`). When
 * the last value ends in ".pod", the generator looks up the whole value in
 * its unit map and fails with `fmt.Errorf("quadlet pod unit %s does not
 * exist", pod)` when absent.
 */
function extractPodRef(value: string): string | null {
  return value.endsWith(".pod") ? value : null;
}

/**
 * source: podman pkg/systemd/quadlet/quadlet.go, addNetworks (called for
 * ContainerGroup, PodGroup, KubeGroup, BuildGroup): multi-valued via
 * LookupAll — every non-empty occurrence is processed independently. The
 * unit name is the part before the first ":" (`strings.Cut(network, ":")`).
 * If that name ends in ".network" or ".container", the generator looks it up
 * and fails with `fmt.Errorf("requested Quadlet unit %s was not found",
 * unit)` when absent.
 */
function extractNetworkRef(value: string): string | null {
  const idx = value.indexOf(":");
  const name = idx === -1 ? value : value.slice(0, idx);
  return name.endsWith(".network") || name.endsWith(".container") ? name : null;
}

/**
 * source: podman pkg/systemd/quadlet/quadlet.go, addVolumes (called for
 * ContainerGroup, PodGroup, BuildGroup): multi-valued, every occurrence. The
 * value is split with `strings.SplitN(volume, ":", 3)`; a SOURCE only exists
 * when there are at least 2 parts (a bare `Volume=data.volume` is a
 * destination only, never a reference). The source then goes through
 * handleStorageSource with checkImage=false: a source starting with "." or
 * "/" is a filesystem path and is never looked up as a unit; otherwise, a
 * source ending in ".volume" or ".artifact" is looked up and fails with
 * `fmt.Errorf("requested Quadlet source %s was not found", source)` when
 * absent.
 */
function extractVolumeRef(value: string): string | null {
  const parts = value.split(":");
  if (parts.length < 2) return null; // bare destination-only form, never a reference
  const source = parts[0]!;
  if (source.startsWith(".") || source.startsWith("/")) return null; // filesystem path
  return source.endsWith(".volume") || source.endsWith(".artifact") ? source : null;
}

const POD: ReferenceKey = { key: "Pod", lastWins: true, extractRef: extractPodRef };
const NETWORK: ReferenceKey = { key: "Network", lastWins: false, extractRef: extractNetworkRef };
const VOLUME: ReferenceKey = { key: "Volume", lastWins: false, extractRef: extractVolumeRef };

export const SECTION_REFERENCES: Readonly<Record<string, readonly ReferenceKey[]>> = {
  Container: [POD, NETWORK, VOLUME],
  Pod: [NETWORK, VOLUME],
  Kube: [NETWORK],
  Build: [NETWORK, VOLUME],
};
