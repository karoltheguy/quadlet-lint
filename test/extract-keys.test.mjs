import { describe, it, expect } from "vitest";
import { extractDocsVersion, upstreamUrl } from "../scripts/extract-keys.mjs";

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
