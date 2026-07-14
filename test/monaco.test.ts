import { describe, it, expect, vi } from "vitest";
import {
  toMarkers,
  lintModel,
  OWNER,
  registerCompletionProvider,
  registerHoverProvider,
  registerCodeActionProvider,
} from "../src/monaco.js";

// Minimal stand-ins for the slice of Monaco the adapter touches. This keeps the
// test dependency-free — no real editor/DOM required.
const MarkerSeverity = { Error: 8, Warning: 4 } as const;

const CompletionItemKind = { Property: 9, Value: 12 } as const;

function fakeMonaco(setModelMarkers = vi.fn()) {
  return {
    MarkerSeverity,
    editor: { setModelMarkers },
    languages: {
      registerCompletionItemProvider: vi.fn(),
      registerHoverProvider: vi.fn(),
      registerCodeActionProvider: vi.fn(),
      CompletionItemKind,
    },
  } as any;
}

function fakeModel(value: string) {
  return { getValue: () => value } as any;
}

/** A fake model with the extra surface the providers need: `uri` and word-under-cursor lookup. */
function fakeProviderModel(
  value: string,
  path: string,
  word: { word: string; startColumn: number; endColumn: number },
) {
  return {
    getValue: () => value,
    uri: { path },
    getWordUntilPosition: () => word,
  } as any;
}

describe("toMarkers", () => {
  it("maps severities and preserves 1-based positions", () => {
    const diagnostics = [
      { line: 3, startColumn: 1, endColumn: 5, severity: "error", code: "QL001", message: "boom" },
      { line: 1, startColumn: 2, endColumn: 6, severity: "warning", code: "QL010", message: "hmm" },
    ] as const;
    const markers = toMarkers(fakeMonaco(), diagnostics as any);
    expect(markers[0]).toMatchObject({
      severity: MarkerSeverity.Error,
      startLineNumber: 3,
      endLineNumber: 3,
      startColumn: 1,
      endColumn: 5,
      code: "QL001",
      source: OWNER,
    });
    expect(markers[1]!.severity).toBe(MarkerSeverity.Warning);
  });
});

describe("lintModel", () => {
  it("lints the model text and publishes markers under the owner", () => {
    const setModelMarkers = vi.fn();
    const monaco = fakeMonaco(setModelMarkers);
    const model = fakeModel("[Continer]\nImage=x");

    const diagnostics = lintModel(monaco, model);

    expect(diagnostics).toHaveLength(1);
    expect(setModelMarkers).toHaveBeenCalledTimes(1);
    const [passedModel, owner, markers] = setModelMarkers.mock.calls[0]!;
    expect(passedModel).toBe(model);
    expect(owner).toBe(OWNER);
    expect(markers).toHaveLength(1);
  });

  it("clears markers when the file becomes valid", () => {
    const setModelMarkers = vi.fn();
    const monaco = fakeMonaco(setModelMarkers);
    lintModel(monaco, fakeModel("[Container]\nImage=x"));
    const markers = setModelMarkers.mock.calls[0]![2];
    expect(markers).toEqual([]);
  });
});

describe("registerCompletionProvider", () => {
  it("registers a completion provider for the given language", () => {
    const monacoNs = fakeMonaco();
    const result = registerCompletionProvider(monacoNs, "ini");

    expect(monacoNs.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(1);
    const [languageId, provider] = monacoNs.languages.registerCompletionItemProvider.mock.calls[0]!;
    expect(languageId).toBe("ini");
    expect(typeof provider.provideCompletionItems).toBe("function");
    expect(result).toBe(monacoNs.languages.registerCompletionItemProvider.mock.results[0]!.value);
  });

  it("suggests keys with a range anchored at the current word", () => {
    const monacoNs = fakeMonaco();
    registerCompletionProvider(monacoNs, "ini");
    const provider = monacoNs.languages.registerCompletionItemProvider.mock.calls[0]![1];

    const model = fakeProviderModel("[Container]\n", "/demo.container", {
      word: "",
      startColumn: 1,
      endColumn: 1,
    });

    const result = provider.provideCompletionItems(model, { lineNumber: 2, column: 1 });
    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("Image");
    expect(labels).toContain("Exec");

    for (const suggestion of result.suggestions) {
      expect(suggestion.range.startLineNumber).toBe(2);
      expect(suggestion.range.endLineNumber).toBe(2);
      expect(suggestion.range.startColumn).toBe(1);
      expect(suggestion.range.endColumn).toBe(1);
      expect(suggestion.insertText).toBe(suggestion.label);
    }
  });

  it("threads the model's fileName through to filter section suggestions", () => {
    const monacoNs = fakeMonaco();
    registerCompletionProvider(monacoNs, "ini");
    const provider = monacoNs.languages.registerCompletionItemProvider.mock.calls[0]![1];

    const model = fakeProviderModel("[", "/web.container", {
      word: "",
      startColumn: 2,
      endColumn: 2,
    });

    const result = provider.provideCompletionItems(model, { lineNumber: 1, column: 2 });
    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("Container");
    expect(labels).not.toContain("Pod");
  });
});

describe("registerHoverProvider", () => {
  it("registers a hover provider for the given language", () => {
    const monacoNs = fakeMonaco();
    const result = registerHoverProvider(monacoNs, "ini");

    expect(monacoNs.languages.registerHoverProvider).toHaveBeenCalledTimes(1);
    const [languageId, provider] = monacoNs.languages.registerHoverProvider.mock.calls[0]!;
    expect(languageId).toBe("ini");
    expect(typeof provider.provideHover).toBe("function");
    expect(result).toBe(monacoNs.languages.registerHoverProvider.mock.results[0]!.value);
  });

  it("surfaces key documentation on hover", () => {
    const monacoNs = fakeMonaco();
    registerHoverProvider(monacoNs, "ini");
    const provider = monacoNs.languages.registerHoverProvider.mock.calls[0]![1];

    const model = fakeProviderModel(
      "[Container]\nAddHost=example:1.2.3.4\n",
      "/demo.container",
      { word: "AddHost", startColumn: 1, endColumn: 8 },
    );

    const result = provider.provideHover(model, { lineNumber: 2, column: 1 });
    expect(result).not.toBeNull();
    const joined = result.contents.map((c: any) => c.value).join("\n");
    expect(joined).toContain("Add host-to-IP mapping to /etc/hosts");
    expect(joined).toContain("AddHost");
  });

  it("returns null when the cursor is not on a known key", () => {
    const monacoNs = fakeMonaco();
    registerHoverProvider(monacoNs, "ini");
    const provider = monacoNs.languages.registerHoverProvider.mock.calls[0]![1];

    const model = fakeProviderModel(
      "[Container]\nAddHost=example:1.2.3.4\n",
      "/demo.container",
      { word: "Container", startColumn: 2, endColumn: 11 },
    );

    const result = provider.provideHover(model, { lineNumber: 1, column: 1 });
    expect(result).toBeNull();
  });
});

describe("registerCodeActionProvider", () => {
  it("registers a code action provider for the given language", () => {
    const monacoNs = fakeMonaco();
    const result = registerCodeActionProvider(monacoNs, "ini");

    expect(monacoNs.languages.registerCodeActionProvider).toHaveBeenCalledTimes(1);
    const [languageId, provider] = monacoNs.languages.registerCodeActionProvider.mock.calls[0]!;
    expect(languageId).toBe("ini");
    expect(typeof provider.provideCodeActions).toBe("function");
    expect(result).toBe(monacoNs.languages.registerCodeActionProvider.mock.results[0]!.value);
  });

  it("offers a QL030 quick fix for a typo'd key", () => {
    const monacoNs = fakeMonaco();
    registerCodeActionProvider(monacoNs, "ini");
    const provider = monacoNs.languages.registerCodeActionProvider.mock.calls[0]![1];

    const uri = { path: "/demo.container" };
    const model = { getValue: () => "[Container]\nImge=foo\n", uri } as any;

    const marker = {
      code: "QL030",
      severity: 4,
      message: "whatever",
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 5,
    };

    const result = provider.provideCodeActions(model, {} as any, { markers: [marker] });
    expect(typeof result.dispose).toBe("function");
    expect(result.actions).toHaveLength(1);

    const action = result.actions[0];
    expect(action.title).toBe('Change to "Image"');
    expect(action.kind).toContain("quickfix");
    expect(action.edit.edits).toHaveLength(1);
    const edit = action.edit.edits[0];
    expect(edit.resource).toBe(uri);
    expect(edit.textEdit).toEqual({
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 5 },
      text: "Image",
    });
  });

  it("returns no actions when there are no QL030 markers", () => {
    const monacoNs = fakeMonaco();
    registerCodeActionProvider(monacoNs, "ini");
    const provider = monacoNs.languages.registerCodeActionProvider.mock.calls[0]![1];

    const uri = { path: "/demo.container" };
    const model = { getValue: () => "[Container]\nImge=foo\n", uri } as any;

    const marker = {
      code: "QL001",
      severity: 8,
      message: "x",
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
    };

    const result = provider.provideCodeActions(model, {} as any, { markers: [marker] });
    expect(result.actions).toEqual([]);
    expect(typeof result.dispose).toBe("function");
  });
});
