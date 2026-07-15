import { describe, it, expect } from "vitest";
import {
  getHover,
  getCompletions,
  getQuickFixes,
  lintQuadlet,
  type HoverInfo,
  type CompletionItem,
} from "../src/service.js";
import type { Diagnostic } from "../src/index.js";

const ADD_HOST_DESCRIPTION = "Add host-to-IP mapping to /etc/hosts. The format is `hostname:ip`.";
const IMAGE_DESCRIPTION =
  "The image to run in the container. It is recommended to use a fully qualified image name rather than a short name, both for performance and robustness reasons.";

describe("getHover", () => {
  it("returns hover info for a known key with a description (start of key)", () => {
    const text = "[Container]\nAddHost=example:1.2.3.4\n";
    const result = getHover(text, { line: 2, column: 1 });
    const expected: HoverInfo = {
      section: "Container",
      key: "AddHost",
      description: ADD_HOST_DESCRIPTION,
    };
    expect(result).toEqual(expected);
  });

  it("returns hover info for a known key with a description (end of key, inclusive)", () => {
    const text = "[Container]\nAddHost=example:1.2.3.4\n";
    const result = getHover(text, { line: 2, column: 8 });
    const expected: HoverInfo = {
      section: "Container",
      key: "AddHost",
      description: ADD_HOST_DESCRIPTION,
    };
    expect(result).toEqual(expected);
  });

  it("returns hover info for a Build key with description (Build/Arch)", () => {
    const text = "[Build]\nArch=amd64\n";
    const result = getHover(text, { line: 2, column: 2 });
    const expected: HoverInfo = {
      section: "Build",
      key: "Arch",
      description: "Override the architecture, defaults to hosts’, of the image to be built.",
    };
    expect(result).toEqual(expected);
  });

  it("returns null when the cursor is inside the value, not the key", () => {
    const text = "[Container]\nAddHost=example:1.2.3.4\n";
    const result = getHover(text, { line: 2, column: 12 });
    expect(result).toBeNull();
  });

  it("returns null for the character just past the inclusive key range (the '=')", () => {
    const text = "[Container]\nAddHost=example:1.2.3.4\n";
    // keyStart=0, key length 7 -> valid inclusive range is [1,8]; column 9 is on "=".
    const result = getHover(text, { line: 2, column: 9 });
    expect(result).toBeNull();
  });

  it("returns null for an assignment before any [Section] header", () => {
    const text = "AddHost=x\n[Container]\n";
    const result = getHover(text, { line: 1, column: 2 });
    expect(result).toBeNull();
  });

  it("returns null for an unknown key", () => {
    const text = "[Container]\nNotARealKey=1\n";
    const result = getHover(text, { line: 2, column: 3 });
    expect(result).toBeNull();
  });

  it("returns null in a standard systemd section with no key data", () => {
    const text = "[Unit]\nDescription=hi\n";
    const result = getHover(text, { line: 2, column: 3 });
    expect(result).toBeNull();
  });

  it("returns hover info for an indented key", () => {
    const text = "[Container]\n  Image=alpine\n";
    // keyStart=2, key length 5 -> valid inclusive range is [3,8].
    const result = getHover(text, { line: 2, column: 3 });
    const expected: HoverInfo = {
      section: "Container",
      key: "Image",
      description: IMAGE_DESCRIPTION,
    };
    expect(result).toEqual(expected);
  });

  it("returns null when hovering a continuation line, and does not treat a section-looking continuation as a new section", () => {
    const text = "[Container]\nExec=foo \\\n[NotASection]=bar\n";
    const result = getHover(text, { line: 3, column: 2 });
    expect(result).toBeNull();
  });

  it("skips a multi-line continuation and still reports the correct enclosing section afterward", () => {
    const text = "[Container]\nAnnotation=a=b \\\nc=d\nImage=alpine\n";
    const result = getHover(text, { line: 4, column: 2 });
    const expected: HoverInfo = {
      section: "Container",
      key: "Image",
      description: IMAGE_DESCRIPTION,
    };
    expect(result).toEqual(expected);
  });

  it("returns null when the cursor is on a section header line", () => {
    const text = "[Container]\n";
    const result = getHover(text, { line: 1, column: 2 });
    expect(result).toBeNull();
  });

  it("returns null when the cursor is beyond the last line, without throwing", () => {
    const text = "[Container]\nAddHost=example:1.2.3.4\n";
    expect(() => getHover(text, { line: 99, column: 1 })).not.toThrow();
    expect(getHover(text, { line: 99, column: 1 })).toBeNull();
  });
});

describe("getCompletions", () => {
  function labels(items: CompletionItem[]): string[] {
    return items.map((item) => item.label);
  }

  it("suggests section headers filtered by fileName", () => {
    const text = "[";
    const result = getCompletions(text, { line: 1, column: 2 }, "web.container");
    const found = labels(result);
    expect(found).toEqual(expect.arrayContaining(["Container", "Unit", "Service", "Install", "Quadlet"]));
    expect(found).not.toEqual(expect.arrayContaining(["Pod", "Network", "Volume", "Kube", "Build", "Image", "Artifact"]));
  });

  it("suggests all section headers when no fileName is given", () => {
    const text = "[";
    const result = getCompletions(text, { line: 1, column: 2 });
    const found = labels(result);
    expect(found).toEqual(expect.arrayContaining(["Container", "Pod"]));
  });

  it("suggests section headers when there is no section yet", () => {
    const text = "";
    const result = getCompletions(text, { line: 1, column: 1 });
    const found = labels(result);
    expect(found).toEqual(expect.arrayContaining(["Container", "Unit"]));
    expect(found).not.toEqual(expect.arrayContaining(["Exec"]));
  });

  it("suggests keys within a known section", () => {
    const text = "[Container]\n";
    const result = getCompletions(text, { line: 2, column: 1 });
    const found = labels(result);
    expect(found).toEqual(expect.arrayContaining(["Image", "Exec"]));
    expect(found).not.toEqual(expect.arrayContaining(["Container"]));
  });

  it("returns no key completions in a standard systemd section", () => {
    const text = "[Unit]\n";
    const result = getCompletions(text, { line: 2, column: 1 });
    expect(result).toEqual([]);
  });

  it("suggests enum values for a key with fixed options", () => {
    const text = "[Container]\nPull=";
    const result = getCompletions(text, { line: 2, column: 6 });
    expect(labels(result).sort()).toEqual(["always", "missing", "never", "newer"]);
  });

  it("suggests enum values for a key with fixed options, mid-value", () => {
    const text = "[Container]\nPull=alw";
    const result = getCompletions(text, { line: 2, column: 9 });
    expect(labels(result).sort()).toEqual(["always", "missing", "never", "newer"]);
  });

  it("returns no enum completions for a free-form key", () => {
    const text = "[Container]\nImage=";
    const result = getCompletions(text, { line: 2, column: 7 });
    expect(result).toEqual([]);
  });

  it("returns no completions on a continuation line", () => {
    const text = "[Container]\nExec=foo \\\n";
    const result = getCompletions(text, { line: 3, column: 1 });
    expect(result).toEqual([]);
  });
});

describe("getQuickFixes", () => {
  it("suggests a fix for a typo'd key with a close match", () => {
    const text = "[Container]\nImge=foo\n";
    const diags = lintQuadlet(text);
    const diag = diags.find((d: Diagnostic) => d.code === "QL030");
    expect(diag).toBeDefined();
    const fixes = getQuickFixes(text, diag as Diagnostic);
    expect(fixes).toEqual([
      {
        title: 'Change to "Image"',
        edits: [{ line: 2, startColumn: 1, endColumn: 5, newText: "Image" }],
      },
    ]);
  });

  it("returns no fixes when there is no close match", () => {
    const text = "[Container]\nZzzzzzzz=foo\n";
    const diags = lintQuadlet(text);
    const diag = diags.find((d: Diagnostic) => d.code === "QL030");
    expect(diag).toBeDefined();
    const fixes = getQuickFixes(text, diag as Diagnostic);
    expect(fixes).toEqual([]);
  });

  it("returns no fixes for a diagnostic code it does not handle", () => {
    const text = "not-a-valid-line\n";
    const diags = lintQuadlet(text);
    const diag = diags.find((d: Diagnostic) => d.code !== "QL010" && d.code !== "QL030");
    expect(diag).toBeDefined();
    const fixes = getQuickFixes(text, diag as Diagnostic);
    expect(fixes).toEqual([]);
  });

  it("suggests a fix for a typo'd section name with a close match", () => {
    const text = "[Instal]\n";
    const diags = lintQuadlet(text);
    const diag = diags.find((d: Diagnostic) => d.code === "QL010");
    expect(diag).toBeDefined();
    const fixes = getQuickFixes(text, diag as Diagnostic);
    expect(fixes).toEqual([
      { title: 'Change to "[Install]"', edits: [{ line: 1, startColumn: 1, endColumn: 9, newText: "[Install]" }] },
    ]);
  });

  it("returns no section fix when there is no close match", () => {
    const text = "[Zzzzzzzzzz]\n";
    const diags = lintQuadlet(text);
    const diag = diags.find((d: Diagnostic) => d.code === "QL010");
    expect(diag).toBeDefined();
    expect(getQuickFixes(text, diag as Diagnostic)).toEqual([]);
  });
});
