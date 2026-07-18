import { describe, it, expect } from "vitest";
import { buildUnitIndex, type UnitIndex } from "../src/unit-index.js";
import { lintQuadlet } from "../src/index.js";

describe("buildUnitIndex", () => {
  it("collects unit basenames from recognized Quadlet files", () => {
    const index = buildUnitIndex([
      "/etc/containers/systemd/web.container",
      "/etc/containers/systemd/nested/backend.network",
      "/somewhere/data.volume",
    ]);
    expect(index).toEqual(new Set(["web.container", "backend.network", "data.volume"]));
  });

  it("covers every Quadlet unit type", () => {
    const index = buildUnitIndex([
      "/x/app.pod",
      "/x/app.kube",
      "/x/app.build",
      "/x/app.image",
      "/x/app.artifact",
    ]);
    expect(index).toEqual(
      new Set(["app.pod", "app.kube", "app.build", "app.image", "app.artifact"]),
    );
  });

  it("excludes drop-in .conf files", () => {
    const index = buildUnitIndex(["/etc/containers/systemd/web.container.d/10-override.conf"]);
    expect(index).toEqual(new Set());
  });

  it("excludes files with unrecognized extensions", () => {
    const index = buildUnitIndex(["/x/notes.txt", "/x/README.md", "/x/noextension"]);
    expect(index).toEqual(new Set());
  });

  it("dedupes the same unit basename found under different directories", () => {
    const index = buildUnitIndex(["/a/web.container", "/b/web.container"]);
    expect(index).toEqual(new Set(["web.container"]));
    expect(index.size).toBe(1);
  });

  it("returns an empty index for empty input", () => {
    const index = buildUnitIndex([]);
    expect(index).toEqual(new Set());
  });
});

describe("lintQuadlet with a unit index", () => {
  it("produces byte-identical diagnostics with and without a unitIndex", () => {
    const text = "[Container]\nPublishPort=8080:80";
    const withIndex = lintQuadlet(text, {
      fileName: "web.container",
      unitIndex: buildUnitIndex(["/x/other.pod"]) as UnitIndex,
    });
    const withoutIndex = lintQuadlet(text, { fileName: "web.container" });
    expect(withIndex.length).toBeGreaterThan(0);
    expect(withIndex).toEqual(withoutIndex);
  });

  it("leaves a clean file clean when a unitIndex is supplied", () => {
    const text = "[Container]\nImage=docker.io/library/nginx:latest";
    const withoutIndex = lintQuadlet(text, { fileName: "web.container" });
    const withIndex = lintQuadlet(text, {
      fileName: "web.container",
      unitIndex: buildUnitIndex(["/x/other.pod"]) as UnitIndex,
    });
    if (withoutIndex.length === 0) {
      expect(withIndex).toEqual([]);
    } else {
      expect(withIndex).toEqual(withoutIndex);
    }
  });
});
