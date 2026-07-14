import { describe, it, expect } from "vitest";
import { expectedSectionFor } from "../src/sections.js";
import { lintQuadlet } from "../src/index.js";

describe("expectedSectionFor", () => {
  it("maps each of the 8 Quadlet extensions to its section name", () => {
    expect(expectedSectionFor("app.container")).toBe("Container");
    expect(expectedSectionFor("app.pod")).toBe("Pod");
    expect(expectedSectionFor("app.network")).toBe("Network");
    expect(expectedSectionFor("app.volume")).toBe("Volume");
    expect(expectedSectionFor("app.kube")).toBe("Kube");
    expect(expectedSectionFor("app.build")).toBe("Build");
    expect(expectedSectionFor("app.image")).toBe("Image");
    expect(expectedSectionFor("app.artifact")).toBe("Artifact");
  });

  it("works on path-prefixed names", () => {
    expect(expectedSectionFor("some/dir/web.container")).toBe("Container");
  });

  it("returns null for unrecognized extensions", () => {
    expect(expectedSectionFor("app.txt")).toBeNull();
    expect(expectedSectionFor("app.service")).toBeNull();
    expect(expectedSectionFor("container")).toBeNull();
  });

  it("is case-sensitive: an uppercase extension is not recognized", () => {
    expect(expectedSectionFor("app.Container")).toBeNull();
  });
});

describe("lintQuadlet with fileName option", () => {
  it("accepts an optional { fileName } second argument without changing behavior", () => {
    const text = "[Container]\nImagee=x";
    expect(lintQuadlet(text, { fileName: "web.container" })).toEqual(lintQuadlet(text));
  });
});
