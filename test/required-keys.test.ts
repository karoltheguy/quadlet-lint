import { describe, it, expect } from "vitest";
import { lintQuadlet } from "../src/index.js";

/** Convenience: QL060/QL061 diagnostics present in a lint run. */
function required(text: string, fileName?: string) {
  return lintQuadlet(text, fileName !== undefined ? { fileName } : undefined).filter(
    (d) => d.code === "QL060" || d.code === "QL061",
  );
}

describe("QL060 required key missing", () => {
  it("flags [Container] with neither Image nor Rootfs", () => {
    const text = "[Container]\nPublishPort=8080:80";
    const diags = required(text, "web.container");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL060",
      severity: "error",
      line: 1,
    });
  });

  it("flags [Container] with only an empty Image=", () => {
    const text = "[Container]\nImage=";
    const diags = required(text, "web.container");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL060",
      severity: "error",
      line: 1,
    });
  });

  it("flags [Kube] with no Yaml=", () => {
    const text = "[Kube]\nNetwork=host";
    const diags = required(text, "app.kube");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL060",
      severity: "error",
      line: 1,
    });
  });

  it("flags [Build] with no ImageTag=", () => {
    const text = "[Build]\nFile=Containerfile";
    const diags = required(text, "img.build");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL060",
      severity: "error",
      line: 1,
    });
  });

  it("flags [Build] with ImageTag= set but neither File nor SetWorkingDirectory", () => {
    const text = "[Build]\nImageTag=my-image:latest";
    const diags = required(text, "img.build");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL060",
      severity: "error",
      line: 1,
    });
  });

  it("flags [Artifact] with no Artifact=", () => {
    const text = "[Artifact]\nArch=amd64";
    const diags = required(text, "art.artifact");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL060",
      severity: "error",
      line: 1,
    });
  });

  it("flags [Artifact] with only an empty Artifact=", () => {
    const text = "[Artifact]\nArtifact=";
    const diags = required(text, "art.artifact");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL060",
      severity: "error",
      line: 1,
    });
  });

  it("does not flag a non-empty Image=", () => {
    const text = "[Container]\nImage=docker.io/library/nginx:latest";
    expect(required(text, "web.container")).toEqual([]);
  });

  it("does not flag a non-empty Rootfs= with no Image=", () => {
    const text = "[Container]\nRootfs=/var/lib/rootfs";
    expect(required(text, "web.container")).toEqual([]);
  });

  it("does not flag a drop-in .conf file that merely overrides some keys", () => {
    const text = "[Container]\nPublishPort=8080:80";
    expect(required(text, "web.container.d/10-override.conf")).toEqual([]);
  });

  it("does not flag when there is no fileName at all", () => {
    const text = "[Container]\nPublishPort=8080:80";
    expect(required(text)).toEqual([]);
  });
});

describe("QL061 conditional requirement unmet", () => {
  it("flags [Volume] with Driver=image and no Image=", () => {
    const text = "[Volume]\nDriver=image";
    const diags = required(text, "data.volume");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL061",
      severity: "error",
      line: 1,
    });
  });

  it("flags [Network] with Gateway= but no Subnet=", () => {
    const text = "[Network]\nGateway=10.0.0.1";
    const diags = required(text, "net.network");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL061",
      severity: "error",
      line: 1,
    });
  });

  it("flags [Network] with IPRange= but no Subnet=", () => {
    const text = "[Network]\nIPRange=10.0.0.0/25";
    const diags = required(text, "net.network");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL061",
      severity: "error",
      line: 1,
    });
  });

  it("does not flag [Volume] with Driver=image and a present but empty Image= (presence-only check)", () => {
    const text = "[Volume]\nDriver=image\nImage=";
    expect(required(text, "data.volume")).toEqual([]);
  });

  it("does not flag [Volume] with a differently-cased Driver=Image (case-sensitive comparison)", () => {
    const text = "[Volume]\nDriver=Image";
    expect(required(text, "data.volume")).toEqual([]);
  });

  it("does not flag [Volume] with no Driver= at all and no Image=", () => {
    const text = "[Volume]\nVolumeName=data";
    expect(required(text, "data.volume")).toEqual([]);
  });

  it("does not flag [Network] with Subnet= and Gateway= both present", () => {
    const text = "[Network]\nSubnet=10.0.0.0/24\nGateway=10.0.0.1";
    expect(required(text, "net.network")).toEqual([]);
  });
});
