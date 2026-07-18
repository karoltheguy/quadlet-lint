import { describe, it, expect } from "vitest";
import {
  getHover,
  getCompletions,
  getQuickFixes,
  lintQuadlet,
  SECTION_SKELETONS,
  type HoverInfo,
  type CompletionItem,
} from "../src/service.js";
import type { Diagnostic } from "../src/index.js";
import { FILE_TYPE_SECTIONS, isKnownKey } from "../src/sections.js";

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

  it("returns null in a section with no key data", () => {
    const text = "[X-Custom]\nDescription=hi\n";
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

  it("returns no key completions in a section without key data", () => {
    const text = "[X-Custom]\n";
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

describe("getQuickFixes (QL040/QL050, extended with fileName)", () => {
  it("suggests a fix for an unrecognized enum value with a close match (QL040)", () => {
    const text = "[Container]\nImage=img\nPull=allways\n";
    const diags = lintQuadlet(text, { fileName: "web.container" });
    const diag = diags.find((d: Diagnostic) => d.code === "QL040");
    expect(diag).toBeDefined();
    const fixes = getQuickFixes(text, diag as Diagnostic, "web.container");
    expect(fixes).toEqual([
      {
        title: 'Change to "always"',
        edits: [
          {
            line: (diag as Diagnostic).line,
            startColumn: (diag as Diagnostic).startColumn,
            endColumn: (diag as Diagnostic).endColumn,
            newText: "always",
          },
        ],
      },
    ]);
  });

  it("returns no fixes for an enum value with no close match (QL040)", () => {
    const text = "[Container]\nImage=img\nPull=zzzzzz\n";
    const diags = lintQuadlet(text, { fileName: "web.container" });
    const diag = diags.find((d: Diagnostic) => d.code === "QL040");
    expect(diag).toBeDefined();
    const fixes = getQuickFixes(text, diag as Diagnostic, "web.container");
    expect(fixes).toEqual([]);
  });

  it("suggests a fix for a section/file-type mismatch (QL050)", () => {
    const text = "[Pod]\nPodName=p\n";
    const diags = lintQuadlet(text, { fileName: "web.container" });
    const diag = diags.find((d: Diagnostic) => d.code === "QL050" && d.severity === "warning");
    expect(diag).toBeDefined();
    const fixes = getQuickFixes(text, diag as Diagnostic, "web.container");
    expect(fixes).toEqual([
      {
        title: 'Change to "[Container]"',
        edits: [
          {
            line: (diag as Diagnostic).line,
            startColumn: (diag as Diagnostic).startColumn,
            endColumn: (diag as Diagnostic).endColumn,
            newText: "[Container]",
          },
        ],
      },
    ]);
  });

  it("suggests a fix to insert the missing required section (QL050)", () => {
    const text = "[Unit]\nDescription=hi\n";
    const diags = lintQuadlet(text, { fileName: "web.container" });
    const diag = diags.find((d: Diagnostic) => d.code === "QL050" && d.severity === "error");
    expect(diag).toBeDefined();
    const fixes = getQuickFixes(text, diag as Diagnostic, "web.container");
    expect(fixes).toEqual([
      {
        title: 'Insert "[Container]" section',
        edits: [{ line: 1, startColumn: 1, endColumn: 1, newText: "[Container]\n" }],
      },
    ]);
  });

  it("returns no fixes for a QL050 mismatch when no fileName is given to getQuickFixes", () => {
    const text = "[Pod]\nPodName=p\n";
    const diags = lintQuadlet(text, { fileName: "web.container" });
    const diag = diags.find((d: Diagnostic) => d.code === "QL050" && d.severity === "warning");
    expect(diag).toBeDefined();
    const fixes = getQuickFixes(text, diag as Diagnostic);
    expect(fixes).toEqual([]);
  });

  it("still fixes a typo'd key when the extra fileName argument is passed (regression)", () => {
    const text = "[Container]\nImge=foo\n";
    const diags = lintQuadlet(text);
    const diag = diags.find((d: Diagnostic) => d.code === "QL030");
    expect(diag).toBeDefined();
    const fixes = getQuickFixes(text, diag as Diagnostic, "web.container");
    expect(fixes).toEqual([
      {
        title: 'Change to "Image"',
        edits: [{ line: 2, startColumn: 1, endColumn: 5, newText: "Image" }],
      },
    ]);
  });
});

describe("systemd section completions and hover", () => {
  function labels(items: CompletionItem[]): string[] {
    return items.map((item) => item.label);
  }

  it("suggests keys within [Unit]", () => {
    const text = "[Unit]\n";
    const result = getCompletions(text, { line: 2, column: 1 });
    const found = labels(result);
    expect(found).toEqual(expect.arrayContaining(["Description", "After"]));
  });

  it("suggests keys within [Service]", () => {
    const text = "[Service]\n";
    const result = getCompletions(text, { line: 2, column: 1 });
    const found = labels(result);
    expect(found).toEqual(expect.arrayContaining(["Restart", "ExecStartPre"]));
  });

  it("suggests keys within [Install]", () => {
    const text = "[Install]\n";
    const result = getCompletions(text, { line: 2, column: 1 });
    const found = labels(result);
    expect(found).toEqual(
      expect.arrayContaining(["WantedBy", "Alias", "RequiredBy", "UpheldBy"]),
    );
  });

  it("returns hover info for WantedBy in [Install]", () => {
    const text = "[Install]\nWantedBy=multi-user.target\n";
    const result = getHover(text, { line: 2, column: 2 });
    expect(result).not.toBeNull();
    expect(result?.section).toBe("Install");
    expect(result?.key).toBe("WantedBy");
    expect(typeof result?.description).toBe("string");
    expect(result?.description).not.toBeNull();
  });

  it("returns hover info for a known-but-undescribed [Unit] key", () => {
    const text = "[Unit]\nConditionACPower=true\n";
    const result = getHover(text, { line: 2, column: 2 });
    expect(result).not.toBeNull();
    expect(result?.key).toBe("ConditionACPower");
  });

  it("returns null for a bogus key in [Unit]", () => {
    const text = "[Unit]\nNotARealKey=x\n";
    const result = getHover(text, { line: 2, column: 2 });
    expect(result).toBeNull();
  });

  it("does not emit QL030 for unknown keys in [Unit], [Service], or [Install]", () => {
    const text =
      "[Unit]\nSomeMadeUpKey=1\n[Service]\nSomeMadeUpKey=1\n[Install]\nSomeMadeUpKey=1\n";
    const diags = lintQuadlet(text);
    const unknownKeyDiags = diags.filter((d: Diagnostic) => d.code === "QL030");
    expect(unknownKeyDiags).toEqual([]);
  });
});

describe("snippet completions", () => {
  type WithSnippet = { label: string; snippet?: string };

  it("carries a snippet for a key completion that inserts '=' and a caret tabstop", () => {
    const text = "[Container]\n";
    const items = getCompletions(text, { line: 2, column: 1 }) as WithSnippet[];
    const item = items.find((i) => i.label === "Image");
    expect(item).toBeDefined();
    expect(item?.snippet).toBe("Image=$0");
  });

  it("offers a section-skeleton snippet on a fresh line for the file's type", () => {
    const items = getCompletions("", { line: 1, column: 1 }, "web.container") as WithSnippet[];
    const found = items.some((i) => i.snippet === "[Container]\nImage=$0");
    expect(found).toBe(true);
  });

  it("does not offer the section-skeleton snippet after the user has already typed '['", () => {
    const items = getCompletions("[", { line: 1, column: 2 }, "web.container") as WithSnippet[];
    const found = items.some((i) => typeof i.snippet === "string" && i.snippet.includes("\n"));
    expect(found).toBe(false);
  });

  it("keeps enum value completions plain, without a snippet", () => {
    const text = "[Container]\nPull=";
    const items = getCompletions(text, { line: 2, column: 6 }) as WithSnippet[];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.snippet).toBeUndefined();
    }
  });
});

describe("SECTION_SKELETONS table", () => {
  it("covers every file-type section", () => {
    for (const section of FILE_TYPE_SECTIONS) {
      expect(SECTION_SKELETONS[section]).toBeDefined();
    }
  });

  it("has each snippet's header line match its table key", () => {
    for (const [section, snippet] of Object.entries(SECTION_SKELETONS)) {
      expect(snippet.startsWith(`[${section}]`)).toBe(true);
    }
  });

  it("has a known seed key on the second line, when present", () => {
    for (const [section, snippet] of Object.entries(SECTION_SKELETONS)) {
      const lines = snippet.split("\n");
      const secondLine = lines[1] ?? "";
      const match = /^([A-Za-z0-9]+)=/.exec(secondLine);
      if (match) {
        const key = match[1]!;
        expect(isKnownKey(section, key)).toBe(true);
      }
    }
  });

  it("has exactly one caret tabstop per snippet", () => {
    for (const snippet of Object.values(SECTION_SKELETONS)) {
      const matches = snippet.match(/\$0/g) ?? [];
      expect(matches.length).toBe(1);
    }
  });
});
