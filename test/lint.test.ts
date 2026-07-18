import { describe, it, expect } from "vitest";
import { lintQuadlet, Codes, type Diagnostic } from "../src/index.js";

/** Convenience: codes present in a lint run, in order. */
function codes(text: string): string[] {
  return lintQuadlet(text).map((d) => d.code);
}

describe("valid files produce no diagnostics", () => {
  it("a normal .container file", () => {
    const text = [
      "[Unit]",
      "Description=My web app",
      "",
      "[Container]",
      "Image=docker.io/library/nginx:latest",
      "PublishPort=8080:80",
      "# a comment",
      "Environment=FOO=bar",
      "",
      "[Install]",
      "WantedBy=default.target",
    ].join("\n");
    expect(lintQuadlet(text)).toEqual([]);
  });

  it("empty input", () => {
    expect(lintQuadlet("")).toEqual([]);
  });

  it("comments with both # and ;", () => {
    expect(lintQuadlet("# hash\n; semicolon\n[Container]\nImage=x")).toEqual([]);
  });

  it("user-defined X- sections are allowed", () => {
    expect(lintQuadlet("[X-Custom]\nAnything=goes")).toEqual([]);
  });
});

describe("QL001 malformed line", () => {
  it("flags a line with no '='", () => {
    const diags = lintQuadlet("[Container]\nImage=x\nthisisgarbage");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: Codes.MALFORMED_LINE,
      severity: "error",
      line: 3,
    });
  });

  it("does not flag an empty value (Key=)", () => {
    expect(lintQuadlet("[Container]\nExec=")).toEqual([]);
  });

  it("columns point at the trimmed content", () => {
    const diags = lintQuadlet("[Container]\n   garbage   ");
    expect(diags[0]).toMatchObject({ startColumn: 4, endColumn: 14 });
  });
});

describe("QL002 assignment outside section", () => {
  it("flags a key before any section", () => {
    const diags = lintQuadlet("Image=x\n[Container]\nImage=y");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: Codes.ASSIGNMENT_OUTSIDE_SECTION,
      severity: "error",
      line: 1,
    });
  });

  it("comments before the first section are fine", () => {
    expect(lintQuadlet("# header\n[Container]\nImage=x")).toEqual([]);
  });
});

describe("QL010 unknown section", () => {
  it("flags a typo'd section as a warning", () => {
    const diags = lintQuadlet("[Continer]\nImage=x");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: Codes.UNKNOWN_SECTION,
      severity: "warning",
      line: 1,
    });
  });

  it("highlights the whole [header] token", () => {
    const diags = lintQuadlet("  [Nope]  \nImage=x");
    // "[Nope]" starts at column 3 (1-based) and ends just past the ']'.
    expect(diags[0]).toMatchObject({ startColumn: 3, endColumn: 9 });
  });

  it("flags an empty section name", () => {
    const diags = lintQuadlet("[]\n");
    expect(diags[0]).toMatchObject({ code: Codes.UNKNOWN_SECTION });
  });

  it("accepts all known sections (header alone, no unknown-section warning)", () => {
    const sections = [
      "Unit", "Service", "Install", // standard systemd
      "Container", "Pod", "Network", "Volume", "Kube", "Build", "Image", "Artifact", "Quadlet",
    ];
    for (const s of sections) {
      expect(lintQuadlet(`[${s}]\n`)).toEqual([]);
    }
  });

  it("recognizes the [Artifact] and [Quadlet] sections", () => {
    // Regression: these were previously missing from KNOWN_SECTIONS.
    expect(lintQuadlet("[Artifact]\n")).toEqual([]);
    expect(lintQuadlet("[Quadlet]\nDefaultDependencies=false")).toEqual([]);
  });
});

describe("QL010 did you mean", () => {
  it("enriches the message with a suggestion when a close section match exists", () => {
    const diags = lintQuadlet("[Instal]\n");
    const diag = diags.find((d) => d.code === Codes.UNKNOWN_SECTION);
    expect(diag).toBeDefined();
    expect(diag?.message).toContain('Did you mean "[Install]"?');
  });

  it("does not suggest for an empty section name", () => {
    const diags = lintQuadlet("[]\n");
    const diag = diags.find((d) => d.code === Codes.UNKNOWN_SECTION);
    expect(diag).toBeDefined();
    expect(diag?.message).toBe("Empty section name.");
    expect(diag?.message).not.toContain("Did you mean");
  });

  it("does not suggest when no close section match exists", () => {
    const diags = lintQuadlet("[Zzzzzzzzzz]\n");
    const diag = diags.find((d) => d.code === Codes.UNKNOWN_SECTION);
    expect(diag).toBeDefined();
    expect(diag?.message).not.toContain("Did you mean");
  });
});

describe("QL020 duplicate single-valued key", () => {
  it("flags a duplicated Image=", () => {
    const diags = lintQuadlet("[Container]\nImage=a\nImage=b");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: Codes.DUPLICATE_KEY,
      severity: "warning",
      line: 3,
    });
    expect(diags[0]!.message).toContain("line 2");
  });

  it("does NOT flag legitimately repeatable keys", () => {
    const text = [
      "[Container]",
      "Image=x",
      "PublishPort=8080:80",
      "PublishPort=8443:443",
      "Environment=A=1",
      "Environment=B=2",
      "Volume=/a:/a",
      "Volume=/b:/b",
      "Label=one=1",
      "Label=two=2",
    ].join("\n");
    expect(lintQuadlet(text)).toEqual([]);
  });

  it("resets per section (same key in two sections is fine)", () => {
    // Driver is single-valued in both, but they are different sections.
    const text = "[Volume]\nDriver=local\n[Network]\nDriver=bridge";
    expect(lintQuadlet(text)).toEqual([]);
  });

  it("does not flag repeated occurrences of a repeatable key", () => {
    // PublishPort is a valid, repeatable key — neither QL020 nor QL030 should fire.
    expect(lintQuadlet("[Container]\nPublishPort=1:1\nPublishPort=2:2")).toEqual([]);
  });
});

describe("QL030 unknown key", () => {
  it("flags a key not documented for the section", () => {
    const diags = lintQuadlet("[Container]\nSomeFutureKey=a");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: Codes.UNKNOWN_KEY,
      severity: "warning",
      line: 2,
    });
  });

  it("does not validate keys in standard systemd sections", () => {
    // [Unit]/[Service]/[Install] have an open-ended key surface we don't own.
    expect(lintQuadlet("[Unit]\nAnythingGoesHere=1")).toEqual([]);
    expect(lintQuadlet("[Service]\nRestart=always\nWhateverKey=x")).toEqual([]);
    expect(lintQuadlet("[Install]\nWantedBy=default.target")).toEqual([]);
  });

  it("accepts documented keys across sections", () => {
    expect(lintQuadlet("[Container]\nImage=x\nPublishPort=8080:80\nEnvironment=A=1")).toEqual([]);
    expect(lintQuadlet("[Volume]\nDriver=local\nVolumeName=data")).toEqual([]);
    expect(lintQuadlet("[Network]\nNetworkName=web\nSubnet=10.0.0.0/24")).toEqual([]);
  });

  it("does not validate keys in unknown or X- sections", () => {
    // No authoritative list -> no key validation (the section itself may warn).
    expect(lintQuadlet("[X-Custom]\nWhatever=1")).toEqual([]);
    const diags = lintQuadlet("[Bogus]\nWhatever=1");
    expect(diags.every((d) => d.code !== Codes.UNKNOWN_KEY)).toBe(true);
  });

  it("enriches the message with a suggestion when a close match exists", () => {
    const diags = lintQuadlet("[Container]\nImge=foo\n");
    const diag = diags.find((d) => d.code === Codes.UNKNOWN_KEY);
    expect(diag).toBeDefined();
    expect(diag?.message).toContain('Did you mean "Image"?');
  });

  it("still fires (unchanged position) but without a suggestion when there is no close match", () => {
    const diags = lintQuadlet("[Container]\nZzzzzzzz=foo\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: Codes.UNKNOWN_KEY,
      line: 2,
      startColumn: 1,
      endColumn: 9,
    });
    expect(diags[0]!.message).not.toContain("Did you mean");
  });
});

describe("line continuations", () => {
  it("does not treat a continued value's next line as malformed", () => {
    // The second physical line is part of the Exec value, not its own statement.
    const text = "[Container]\nExec=/bin/sh -c \\\n   really a continuation with no equals";
    expect(lintQuadlet(text)).toEqual([]);
  });

  it("an even number of trailing backslashes does not continue", () => {
    // "foo\\\\" ends in an escaped backslash -> the next line IS its own line.
    const diags = lintQuadlet("[Container]\nImage=foo\\\\\ngarbage");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ code: Codes.MALFORMED_LINE, line: 3 });
  });
});

describe("QL040 enum values", () => {
  /** Convenience: QL040 diagnostics present in a lint run. */
  function ql040(text: string): Diagnostic[] {
    return lintQuadlet(text).filter((d) => d.code === "QL040");
  }

  it("flags an unrecognized Pull value with a precise value-only range", () => {
    const diags = ql040("[Container]\nImage=img\nPull=sometimes");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL040",
      severity: "warning",
      line: 3,
      startColumn: 6,
      endColumn: 15,
    });
  });

  it("does not flag a documented Pull value", () => {
    expect(ql040("[Container]\nImage=img\nPull=always")).toEqual([]);
  });

  it("accepts numeric and case-insensitive booleans for ReadOnly", () => {
    expect(ql040("[Container]\nImage=img\nReadOnly=1")).toEqual([]);
    expect(ql040("[Container]\nImage=img\nReadOnly=TRUE")).toEqual([]);
  });

  it("does not flag keys with no curated enum entry", () => {
    expect(ql040("[Container]\nImage=img\nNotify=healthy")).toEqual([]);
  });

  it("never flags free-form keys", () => {
    expect(ql040("[Container]\nImage=whatever")).toEqual([]);
    expect(
      ql040("[Container]\nImage=img\nEnvironment=FOO=bar\nEnvironment=FOO=bar"),
    ).toEqual([]);
  });

  it("does not validate interpolated values", () => {
    expect(ql040("[Container]\nImage=img\nPull=${POLICY}")).toEqual([]);
    expect(ql040("[Container]\nImage=img\nReadOnly=%i")).toEqual([]);
  });

  it("skips values that span a line continuation", () => {
    const text = "[Container]\nImage=img\nPull=alw\\\ncontinued";
    expect(ql040(text)).toEqual([]);
  });

  it("validates Pod ExitPolicy", () => {
    expect(ql040("[Pod]\nExitPolicy=stop")).toEqual([]);
    expect(ql040("[Pod]\nExitPolicy=restart")).toHaveLength(1);
  });
});

describe("QL050 section/file-type mismatch", () => {
  /** Convenience: QL050 diagnostics present in a lint run. */
  function ql050(text: string, fileName?: string): Diagnostic[] {
    return lintQuadlet(text, fileName !== undefined ? { fileName } : undefined).filter(
      (d) => d.code === "QL050",
    );
  }

  it("flags a section that doesn't match the file's extension, plus missing-section", () => {
    const diags = ql050("[Volume]\nVolumeName=v", "web.container");
    expect(diags).toHaveLength(2);
    expect(diags[0]).toMatchObject({
      code: "QL050",
      severity: "warning",
      line: 1,
      startColumn: 1,
      endColumn: 9,
    });
    expect(diags[1]).toMatchObject({
      code: "QL050",
      severity: "error",
      line: 1,
      startColumn: 1,
      endColumn: 9,
    });
  });

  it("does not flag anything when there is no fileName", () => {
    expect(ql050("[Volume]\nVolumeName=v")).toEqual([]);
  });

  it("does not flag a section that matches the file's extension", () => {
    expect(ql050("[Container]\nImage=img", "web.container")).toEqual([]);
  });

  it("does not flag a drop-in that simply omits the expected section", () => {
    expect(ql050("[Service]\nRestart=always", "web.container.d/10.conf")).toEqual([]);
  });

  it("flags a drop-in with the wrong Quadlet section, but no missing-section error", () => {
    const diags = ql050("[Volume]\nVolumeName=v", "web.container.d/10.conf");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ code: "QL050", severity: "warning" });
  });

  it("does not flag standard/exempt sections alongside a correct Quadlet section", () => {
    const text = [
      "[Container]",
      "Image=img",
      "",
      "[Quadlet]",
      "DefaultDependencies=false",
      "",
      "[Unit]",
      "Description=x",
      "",
      "[X-Custom]",
      "Foo=bar",
    ].join("\n");
    expect(ql050(text, "web.container")).toEqual([]);
  });

  it("does not flag anything when the fileName's extension is unresolvable", () => {
    expect(ql050("[Volume]\nVolumeName=v", "notes.txt")).toEqual([]);
  });
});

describe("QL070 conflicting / mutually exclusive keys", () => {
  /** Convenience: QL070 diagnostics present in a lint run. */
  function ql070(text: string): Diagnostic[] {
    return lintQuadlet(text).filter((d) => d.code === Codes.CONFLICTING_KEYS);
  }

  it("flags Image= and Rootfs= together, on the second key's line", () => {
    const text = [
      "[Container]",
      "Image=docker.io/library/nginx:latest",
      "Rootfs=/var/lib/rootfs",
    ].join("\n");
    const diags = ql070(text);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: Codes.CONFLICTING_KEYS,
      severity: "error",
      line: 3,
      startColumn: 1,
      endColumn: 7,
    });
    expect(diags[0]!.message).toContain("Image");
    expect(diags[0]!.message).toContain("Rootfs");
    expect(diags[0]!.message).toContain("line 2");
  });

  it("flags ReloadCmd= and ReloadSignal= together, on the second key's line", () => {
    const text = ["[Container]", "ReloadCmd=/bin/reload.sh", "ReloadSignal=SIGHUP"].join("\n");
    const diags = ql070(text);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: Codes.CONFLICTING_KEYS,
      severity: "error",
      line: 3,
    });
    expect(diags[0]!.message).toContain("ReloadCmd");
    expect(diags[0]!.message).toContain("ReloadSignal");
  });

  it("flags the pair regardless of order, reporting on whichever key comes second", () => {
    const text = [
      "[Container]",
      "Rootfs=/var/lib/rootfs",
      "Image=docker.io/library/nginx:latest",
    ].join("\n");
    const diags = ql070(text);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: Codes.CONFLICTING_KEYS,
      severity: "error",
      line: 3,
    });
    expect(diags[0]!.message).toContain("line 2");
  });

  it("does not flag Image= alone", () => {
    expect(ql070("[Container]\nImage=docker.io/library/nginx:latest")).toEqual([]);
  });

  it("does not flag Rootfs= alone", () => {
    expect(ql070("[Container]\nRootfs=/var/lib/rootfs")).toEqual([]);
  });

  it("is suppressed by a disable-next-line comment above the second key", () => {
    const text = [
      "[Container]",
      "Image=docker.io/library/nginx:latest",
      "# quadlet-lint-disable-next-line QL070",
      "Rootfs=/var/lib/rootfs",
    ].join("\n");
    expect(ql070(text)).toEqual([]);
  });

  it("does not flag an empty Image= paired with a non-empty Rootfs=", () => {
    const text = ["[Container]", "Image=", "Rootfs=/var/lib/rootfs"].join("\n");
    expect(ql070(text)).toEqual([]);
  });

  it("does not flag a non-empty Image= paired with an empty Rootfs=", () => {
    const text = [
      "[Container]",
      "Image=docker.io/library/nginx:latest",
      "Rootfs=",
    ].join("\n");
    expect(ql070(text)).toEqual([]);
  });

  it("does not flag an empty ReloadCmd= paired with a non-empty ReloadSignal=", () => {
    const text = ["[Container]", "ReloadCmd=", "ReloadSignal=HUP"].join("\n");
    expect(ql070(text)).toEqual([]);
  });

  it("does not flag a whitespace-only Image= paired with a non-empty Rootfs=", () => {
    const text = ["[Container]", "Image=   ", "Rootfs=/var/lib/rootfs"].join("\n");
    expect(ql070(text)).toEqual([]);
  });

  it("does not flag when a later empty Image= assignment resets an earlier non-empty one (last-wins)", () => {
    const text = [
      "[Container]",
      "Image=docker.io/library/nginx:latest",
      "Image=",
      "Rootfs=/var/lib/rootfs",
    ].join("\n");
    // A QL020 duplicate-key warning is expected here; only QL070 is under test.
    expect(ql070(text)).toEqual([]);
  });
});

describe("QL080 port-format", () => {
  /** Convenience: QL080 diagnostics present in a lint run. */
  function ql080(text: string): Diagnostic[] {
    return lintQuadlet(text).filter((d) => d.code === "QL080");
  }

  it("flags a PublishPort= host port above the valid range", () => {
    const diags = ql080("[Container]\nPublishPort=99999:80");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL080",
      severity: "warning",
    });
  });

  it("flags an ExposeHostPort= value above the valid range", () => {
    const diags = ql080("[Container]\nExposeHostPort=70000");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: "QL080",
      severity: "warning",
    });
  });

  it("does not flag a bare valid port", () => {
    expect(ql080("[Container]\nPublishPort=65535")).toEqual([]);
  });

  it("does not flag a container:host mapping with a protocol suffix", () => {
    expect(ql080("[Container]\nPublishPort=8080:80/tcp")).toEqual([]);
  });

  it("does not flag an IPv4-qualified mapping", () => {
    expect(ql080("[Container]\nPublishPort=0.0.0.0:8080:80")).toEqual([]);
  });

  it("does not flag a bracketed IPv6 wildcard mapping", () => {
    expect(ql080("[Container]\nPublishPort=[::0]:8080:80")).toEqual([]);
  });

  it("does not flag a bracketed IPv6 mapping with a protocol suffix", () => {
    expect(ql080("[Container]\nPublishPort=[2001:db8::1]:8080:80/udp")).toEqual([]);
  });

  it("does not flag a port range mapping", () => {
    expect(ql080("[Container]\nPublishPort=50-59:5000-5009")).toEqual([]);
  });

  it("does not validate interpolated values", () => {
    expect(ql080("[Container]\nPublishPort=$PORT:80")).toEqual([]);
  });

  it("does not flag an empty value", () => {
    expect(ql080("[Container]\nPublishPort=")).toEqual([]);
  });

  it("skips values that span a line continuation", () => {
    const text = "[Container]\nPublishPort=99999:80 \\\n:81";
    expect(ql080(text)).toEqual([]);
  });
});

describe("diagnostics are ordered and well-formed", () => {
  it("returns results in source order with 1-based positions", () => {
    const text = "badline\n[Oops]\nImage=a\nImage=b";
    const diags = lintQuadlet(text);
    const lines = diags.map((d: Diagnostic) => d.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    for (const d of diags) {
      expect(d.line).toBeGreaterThanOrEqual(1);
      expect(d.startColumn).toBeGreaterThanOrEqual(1);
      expect(d.endColumn).toBeGreaterThanOrEqual(d.startColumn);
    }
  });
});

describe("suppression comments (# quadlet-lint-disable-next-line)", () => {
  it("suppresses the named code on the immediately following line", () => {
    const diags = lintQuadlet("# quadlet-lint-disable-next-line QL010\n[Instal]\n");
    expect(diags.every((d) => d.code !== Codes.UNKNOWN_SECTION)).toBe(true);

    // Baseline sanity check: without the directive, the warning does fire.
    const baseline = lintQuadlet("[Instal]\n");
    expect(baseline.some((d) => d.code === Codes.UNKNOWN_SECTION)).toBe(true);
  });

  it("still suppresses across an intervening blank line", () => {
    const diags = lintQuadlet("# quadlet-lint-disable-next-line QL010\n\n[Instal]\n");
    expect(diags.every((d) => d.code !== Codes.UNKNOWN_SECTION)).toBe(true);
  });

  it("still suppresses across an intervening ordinary comment", () => {
    const diags = lintQuadlet(
      "# quadlet-lint-disable-next-line QL010\n# just a note\n[Instal]\n",
    );
    expect(diags.every((d) => d.code !== Codes.UNKNOWN_SECTION)).toBe(true);
  });

  it("only suppresses the exact code named — other codes on that line still fire", () => {
    const diags = lintQuadlet("# quadlet-lint-disable-next-line QL030\n[Instal]\n");
    expect(diags.some((d) => d.code === Codes.UNKNOWN_SECTION)).toBe(true);
  });

  it("affects only the immediately following code line, not later ones", () => {
    const diags = lintQuadlet(
      "# quadlet-lint-disable-next-line QL010\n[Container]\n[Instal]\n",
    );
    const unknownSection = diags.find((d) => d.code === Codes.UNKNOWN_SECTION);
    expect(unknownSection).toBeDefined();
    expect(unknownSection?.line).toBe(3);
  });

  it("an ordinary comment suppresses nothing", () => {
    const diags = lintQuadlet("# this is not a directive\n[Instal]\n");
    expect(diags.some((d) => d.code === Codes.UNKNOWN_SECTION)).toBe(true);
  });
});
