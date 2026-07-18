import { describe, it, expect } from "vitest";
import { lintQuadlet } from "../src/index.js";

/** Convenience: QL090 diagnostics present in a lint run. */
function ql090(text: string, fileName: string, unitIndex?: ReadonlySet<string>) {
  return lintQuadlet(text, { fileName, unitIndex }).filter((d) => d.code === "QL090");
}

describe("QL090 fires on references missing from the index", () => {
  it("flags [Container] Pod= to a missing pod", () => {
    const text = "[Container]\nImage=quay.io/x\nPod=missing.pod";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL090",
      severity: "warning",
      line: 3,
    });
  });

  it("flags [Container] Network= to a missing network", () => {
    const text = "[Container]\nImage=quay.io/x\nNetwork=missing.network";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL090",
      severity: "warning",
    });
  });

  it("flags [Container] Network= to a missing container unit (container-network join)", () => {
    const text = "[Container]\nImage=quay.io/x\nNetwork=other.container";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL090",
      severity: "warning",
    });
  });

  it("flags [Container] Network= with options after the colon", () => {
    const text = "[Container]\nImage=quay.io/x\nNetwork=missing.network:ip=10.0.0.5";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL090",
      severity: "warning",
    });
  });

  it("flags [Container] Volume= with a missing .volume source", () => {
    const text = "[Container]\nImage=quay.io/x\nVolume=data.volume:/data";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL090",
      severity: "warning",
    });
  });

  it("flags [Container] Volume= with a missing .artifact source", () => {
    const text = "[Container]\nImage=quay.io/x\nVolume=art.artifact:/a";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL090",
      severity: "warning",
    });
  });

  it("flags [Pod] Volume=", () => {
    const text = "[Pod]\nVolume=data.volume:/data";
    const diags = ql090(text, "app.pod", new Set(["app.pod"]));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL090",
      severity: "warning",
    });
  });

  it("flags [Kube] Network=", () => {
    const text = "[Kube]\nYaml=app.yaml\nNetwork=missing.network";
    const diags = ql090(text, "app.kube", new Set(["app.kube"]));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL090",
      severity: "warning",
    });
  });

  it("flags [Build] Network= and Volume=", () => {
    const text =
      "[Build]\nImageTag=t:1\nFile=Containerfile\nNetwork=missing.network\nVolume=data.volume:/data";
    const diags = ql090(text, "img.build", new Set(["img.build"]));
    expect(diags).toHaveLength(2);
    expect(diags.map((d) => d.line).sort()).toEqual([4, 5]);
  });

  it("flags two missing Network= lines in one [Container] section (checked per occurrence)", () => {
    const text =
      "[Container]\nImage=quay.io/x\nNetwork=missing1.network\nNetwork=missing2.network";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toHaveLength(2);
  });

  it("still flags a missing Pod= when a [Service] section follows", () => {
    const text =
      "[Container]\nImage=quay.io/x\nPod=missing.pod\n\n[Service]\nRestart=always";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL090",
      severity: "warning",
      line: 3,
    });
  });
});

describe("QL090 stays silent", () => {
  it("does not flag a reference present in the index", () => {
    const text = "[Container]\nImage=quay.io/x\nPod=app.pod";
    const diags = ql090(
      text,
      "web.container",
      new Set(["web.container", "app.pod"]),
    );
    expect(diags).toEqual([]);
  });

  it("does not flag a bare Volume= with no colon (destination, not a reference)", () => {
    const text = "[Container]\nImage=quay.io/x\nVolume=data.volume";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toEqual([]);
  });

  it("does not flag a relative-path Volume= source", () => {
    const text = "[Container]\nImage=quay.io/x\nVolume=./data.volume:/data";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toEqual([]);
  });

  it("does not flag an absolute-path Volume= source", () => {
    const text = "[Container]\nImage=quay.io/x\nVolume=/srv/data.volume:/data";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toEqual([]);
  });

  it("does not flag Network=host (no recognized suffix)", () => {
    const text = "[Container]\nImage=quay.io/x\nNetwork=host";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toEqual([]);
  });

  it("does not flag Pod= last-wins override to a present unit", () => {
    const text = "[Container]\nImage=quay.io/x\nPod=missing.pod\nPod=real.pod";
    const diags = ql090(
      text,
      "web.container",
      new Set(["web.container", "real.pod"]),
    );
    expect(diags).toEqual([]);
  });

  it("does not flag Pod= last-wins unset (last value empty)", () => {
    const text = "[Container]\nImage=quay.io/x\nPod=missing.pod\nPod=";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toEqual([]);
  });

  it("does not flag when no unitIndex is supplied", () => {
    const text = "[Container]\nImage=quay.io/x\nPod=missing.pod";
    const diags = ql090(text, "web.container");
    expect(diags).toEqual([]);
  });

  it("does not flag a drop-in .conf file", () => {
    const text = "[Container]\nImage=quay.io/x\nNetwork=missing.network";
    const diags = ql090(
      text,
      "web.container.d/10-override.conf",
      new Set(["web.container"]),
    );
    expect(diags).toEqual([]);
  });

  it("does not flag QL090 for a reference key outside the file's own expected section", () => {
    const text = "[Container]\nNetwork=missing.network";
    const diags = ql090(text, "app.pod", new Set(["app.pod"]));
    expect(diags).toEqual([]);
  });

  it("does not flag when suppressed with quadlet-lint-disable-next-line", () => {
    const text =
      "[Container]\nImage=quay.io/x\n# quadlet-lint-disable-next-line QL090\nPod=missing.pod";
    const diags = ql090(text, "web.container", new Set(["web.container"]));
    expect(diags).toEqual([]);
  });
});
