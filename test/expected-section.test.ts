import { describe, it, expect } from "vitest";
import { expectedSectionFor } from "../src/sections.js";
import { lintQuadlet } from "../src/index.js";

describe("expectedSectionFor", () => {
  it("maps each of the 8 Quadlet extensions to its section name", () => {
    expect(expectedSectionFor("app.container")).toEqual({ section: "Container", isDropin: false });
    expect(expectedSectionFor("app.pod")).toEqual({ section: "Pod", isDropin: false });
    expect(expectedSectionFor("app.network")).toEqual({ section: "Network", isDropin: false });
    expect(expectedSectionFor("app.volume")).toEqual({ section: "Volume", isDropin: false });
    expect(expectedSectionFor("app.kube")).toEqual({ section: "Kube", isDropin: false });
    expect(expectedSectionFor("app.build")).toEqual({ section: "Build", isDropin: false });
    expect(expectedSectionFor("app.image")).toEqual({ section: "Image", isDropin: false });
    expect(expectedSectionFor("app.artifact")).toEqual({ section: "Artifact", isDropin: false });
  });

  it("works on path-prefixed names", () => {
    expect(expectedSectionFor("some/dir/web.container")).toEqual({
      section: "Container",
      isDropin: false,
    });
  });

  it("returns null for unrecognized extensions", () => {
    expect(expectedSectionFor("app.txt")).toBeNull();
    expect(expectedSectionFor("app.service")).toBeNull();
    expect(expectedSectionFor("container")).toBeNull();
  });

  it("is case-sensitive: an uppercase extension is not recognized", () => {
    expect(expectedSectionFor("app.Container")).toBeNull();
  });

  describe("drop-in .conf files", () => {
    it("resolves the section from a '<type>.d' immediate parent directory", () => {
      expect(expectedSectionFor("foo.container.d/10-override.conf")).toEqual({
        section: "Container",
        isDropin: true,
      });
    });

    it("resolves a top-level '<type>.d' parent directory", () => {
      expect(expectedSectionFor("container.d/10.conf")).toEqual({
        section: "Container",
        isDropin: true,
      });
    });

    it("resolves a dash-truncated instance name before the type", () => {
      expect(expectedSectionFor("foo-.container.d/10.conf")).toEqual({
        section: "Container",
        isDropin: true,
      });
    });

    it("resolves a templated instance name before the type", () => {
      expect(expectedSectionFor("foo@.container.d/10.conf")).toEqual({
        section: "Container",
        isDropin: true,
      });
    });

    it("resolves a path-prefixed drop-in directory", () => {
      expect(expectedSectionFor("etc/containers/systemd/foo.volume.d/opts.conf")).toEqual({
        section: "Volume",
        isDropin: true,
      });
    });

    it("does not match a parent that merely ends with the type name", () => {
      // "mycontainer.d" is neither exactly "container.d" nor does it end with ".container.d".
      expect(expectedSectionFor("mycontainer.d/10.conf")).toBeNull();
    });

    it("returns null for a bare .conf file not under a '.d' directory", () => {
      expect(expectedSectionFor("foo.conf")).toBeNull();
      expect(expectedSectionFor("somedir/foo.conf")).toBeNull();
    });
  });
});

describe("lintQuadlet with fileName option", () => {
  it("accepts an optional { fileName } second argument matching the content, with no QL050", () => {
    const text = "[Container]\nImagee=x";
    const withFileName = lintQuadlet(text, { fileName: "web.container" });
    expect(withFileName).toEqual(lintQuadlet(text));
    expect(withFileName.every((d) => d.code !== "QL050")).toBe(true);
  });
});
