import { describe, it, expect } from "vitest";
import { extractDocsVersion, upstreamUrl, assertPinnedVersion, DEFAULT_DOCS_VERSION, assertSectionsPopulated, QUADLET_SECTIONS } from "../scripts/extract-keys.mjs";

describe("extractDocsVersion", () => {
  it("extracts version slug from readthedocs meta tag", () => {
    const html = `<meta name="readthedocs-version-slug" content="v6.0.0" />`;
    expect(extractDocsVersion(html)).toBe("v6.0.0");
  });
});

describe("upstreamUrl", () => {
  it("returns documentation URL for given version", () => {
    expect(upstreamUrl("v6.0.0")).toBe(
      "https://docs.podman.io/en/v6.0.0/markdown/podman-systemd.unit.5.html",
    );
  });
});

describe("assertPinnedVersion", () => {
  it("rejects moving aliases that name no fixed docs build", () => {
    for (const alias of ["latest", "stable"]) {
      expect(() => assertPinnedVersion(alias)).toThrow(alias);
    }
  });

  it("accepts a tagged version", () => {
    expect(() => assertPinnedVersion("v6.1.0")).not.toThrow();
  });
});

describe("DEFAULT_DOCS_VERSION", () => {
  it("is a pinned tag, not a moving alias", () => {
    expect(() => assertPinnedVersion(DEFAULT_DOCS_VERSION)).not.toThrow();
  });
});

describe("assertSectionsPopulated", () => {
  const populated = () =>
    new Map(QUADLET_SECTIONS.map((s) => [s, { valid: new Set(["Image"]) }]));

  it("rejects a parse where every section is empty", () => {
    const empty = new Map(QUADLET_SECTIONS.map((s) => [s, { valid: new Set() }]));
    expect(() => assertSectionsPopulated(empty)).toThrow(/Container/);
  });

  it("names the empty section when only one failed to parse", () => {
    const data = populated();
    data.set("Volume", { valid: new Set() });
    expect(() => assertSectionsPopulated(data)).toThrow(/Volume/);
  });

  it("accepts a section carrying a single key", () => {
    expect(() => assertSectionsPopulated(populated())).not.toThrow();
  });
});
