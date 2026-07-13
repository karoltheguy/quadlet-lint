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

  it("accepts all known quadlet sections", () => {
    for (const s of ["Unit", "Service", "Install", "Container", "Pod", "Network", "Volume", "Kube", "Build", "Image"]) {
      expect(lintQuadlet(`[${s}]\nKey=val`)).toEqual([]);
    }
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

  it("does not flag unknown keys (assumed possibly-repeatable)", () => {
    expect(lintQuadlet("[Container]\nSomeFutureKey=a\nSomeFutureKey=b")).toEqual([]);
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
