import { describe, it, expect } from "vitest";
import { getCompletions, getHover, getQuickFixes } from "../src/service.js";
import { lintQuadlet } from "../src/index.js";
import {
  createCompletionProvider,
  createHoverProvider,
  createCodeActionProvider,
} from "../extensions/vscode/src/providers.js";

// Minimal stand-ins for the slice of the `vscode` API the providers touch.
// This keeps the test dependency-free — no real extension host required.
class FakeRange {
  constructor(
    public startLine: number,
    public startChar: number,
    public endLine: number,
    public endChar: number,
  ) {}
}

class FakeCompletionItem {
  detail: string | undefined;
  constructor(public label: string) {}
}

class FakeHover {
  constructor(public contents: unknown) {}
}

class FakeMarkdownString {
  constructor(public value: string) {}
}

class FakeSnippetString {
  constructor(public value: string) {}
}

class FakeCodeAction {
  diagnostics: unknown[] | undefined;
  edit: unknown;
  constructor(
    public title: string,
    public kind: unknown,
  ) {}
}

class FakeWorkspaceEdit {
  replacements: { uri: unknown; range: unknown; newText: string }[] = [];
  replace(uri: unknown, range: unknown, newText: string): void {
    this.replacements.push({ uri, range, newText });
  }
}

const CodeActionKind = { QuickFix: "quickfix" } as const;

function fakeVscode() {
  return {
    Range: FakeRange,
    Position: class FakePosition {
      constructor(
        public line: number,
        public character: number,
      ) {}
    },
    CompletionItem: FakeCompletionItem,
    Hover: FakeHover,
    MarkdownString: FakeMarkdownString,
    SnippetString: FakeSnippetString,
    CodeAction: FakeCodeAction,
    CodeActionKind,
    WorkspaceEdit: FakeWorkspaceEdit,
  } as any;
}

describe("createCompletionProvider", () => {
  it("suggests keys, converting 0-based position/document to 1-based service calls", () => {
    const text = "[Container]\nIm";
    const path = "/demo.container";
    const document = { getText: () => text, uri: { path } };
    const position = { line: 1, character: 2 };

    const expected = getCompletions(text, { line: 2, column: 3 }, path);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.map((i) => i.label)).toContain("Image");

    const vscodeNs = fakeVscode();
    const provider = createCompletionProvider(vscodeNs);
    const result = provider.provideCompletionItems(document, position);

    expect(result.map((i: any) => i.label)).toEqual(expected.map((i) => i.label));
    for (let i = 0; i < expected.length; i++) {
      if (expected[i]!.detail !== undefined) {
        expect((result[i] as any).detail).toBe(expected[i]!.detail);
      }
    }

    const imageItem = result.find((i: any) => i.label === "Image") as any;
    expect(imageItem.insertText).toBeInstanceOf(FakeSnippetString);
    expect((imageItem.insertText as FakeSnippetString).value).toBe("Image=$0");
  });
});

describe("createHoverProvider", () => {
  it("returns hover contents including '**Section / Key**' for a known key", () => {
    const text = "[Container]\nImage=alpine\n";
    const document = { getText: () => text, uri: { path: "/demo.container" } };
    const position = { line: 1, character: 2 };

    const expected = getHover(text, { line: 2, column: 3 });
    expect(expected).not.toBeNull();

    const vscodeNs = fakeVscode();
    const provider = createHoverProvider(vscodeNs);
    const result = provider.provideHover(document, position) as FakeHover;

    expect(result).not.toBeNull();
    const contentsStr = JSON.stringify(result.contents);
    expect(contentsStr).toContain(`**${expected!.section} / ${expected!.key}**`);
  });

  it("returns null when the cursor is not on a known key", () => {
    const text = "[Container]\nImage=alpine\n";
    const document = { getText: () => text, uri: { path: "/demo.container" } };
    const position = { line: 0, character: 0 };

    const vscodeNs = fakeVscode();
    const provider = createHoverProvider(vscodeNs);
    const result = provider.provideHover(document, position);

    expect(result).toBeNull();
  });
});

describe("createCodeActionProvider", () => {
  it("offers a quick fix per getQuickFixes result, recording a WorkspaceEdit replace", () => {
    const text = "[Container]\nImadge=alpine\n";
    const diagnostics = lintQuadlet(text);
    const ql030 = diagnostics.find((d) => d.code === "QL030" && text
      .split(/\r?\n/)[d.line - 1]!
      .slice(d.startColumn - 1, d.endColumn - 1) === "Imadge");
    expect(ql030).toBeDefined();

    const uri = { path: "/demo.container" };
    const document = { getText: () => text, uri };

    const vsDiagnostic = {
      range: {
        start: { line: ql030!.line - 1, character: ql030!.startColumn - 1 },
        end: { line: ql030!.line - 1, character: ql030!.endColumn - 1 },
      },
      message: ql030!.message,
      code: ql030!.code,
      source: "quadlet-lint",
      severity: 1,
    };

    const expectedFixes = getQuickFixes(text, ql030!);
    expect(expectedFixes.length).toBeGreaterThan(0);

    const vscodeNs = fakeVscode();
    const provider = createCodeActionProvider(vscodeNs);
    const result = provider.provideCodeActions(document, {}, {
      diagnostics: [vsDiagnostic],
    }) as FakeCodeAction[];

    expect(result).toHaveLength(expectedFixes.length);

    for (let i = 0; i < expectedFixes.length; i++) {
      const fix = expectedFixes[i]!;
      const action = result[i]!;
      expect(action.title).toBe(fix.title);
      expect(action.kind).toBe(CodeActionKind.QuickFix);
      expect(action.diagnostics).toContain(vsDiagnostic);

      const edit = action.edit as FakeWorkspaceEdit;
      expect(edit.replacements).toHaveLength(fix.edits.length);
      for (let j = 0; j < fix.edits.length; j++) {
        const e = fix.edits[j]!;
        const replacement = edit.replacements[j]!;
        expect(replacement.uri).toBe(uri);
        expect(replacement.range).toEqual(
          new FakeRange(e.line - 1, e.startColumn - 1, e.line - 1, e.endColumn - 1),
        );
        expect(replacement.newText).toBe(e.newText);
      }
    }
  });

  it("returns no actions for a diagnostic from another source", () => {
    const text = "[Container]\nImadge=alpine\n";
    const document = { getText: () => text, uri: { path: "/demo.container" } };

    const vsDiagnostic = {
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 6 },
      },
      message: "whatever",
      code: "QL030",
      source: "other-linter",
      severity: 1,
    };

    const vscodeNs = fakeVscode();
    const provider = createCodeActionProvider(vscodeNs);
    const result = provider.provideCodeActions(document, {}, {
      diagnostics: [vsDiagnostic],
    });

    expect(result).toEqual([]);
  });
});
