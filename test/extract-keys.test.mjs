import { describe, it, expect } from "vitest";
import { extractDocsVersion, upstreamUrl, assertPinnedVersion, DEFAULT_DOCS_VERSION } from "../scripts/extract-keys.mjs";

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
