import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to declare and initialize mock structures before module imports
const mocks = vi.hoisted(() => {
  return {
    createDiagnosticCollection: vi.fn(),
    registerCompletionItemProvider: vi.fn(),
    registerHoverProvider: vi.fn(),
    registerCodeActionsProvider: vi.fn(),
    onDidOpenTextDocument: vi.fn(),
    onDidChangeTextDocument: vi.fn(),
    onDidCloseTextDocument: vi.fn(),
    textDocuments: [] as any[],
  };
});

vi.mock("vscode", () => {
  return {
    languages: {
      createDiagnosticCollection: mocks.createDiagnosticCollection,
      registerCompletionItemProvider: mocks.registerCompletionItemProvider,
      registerHoverProvider: mocks.registerHoverProvider,
      registerCodeActionsProvider: mocks.registerCodeActionsProvider,
    },
    workspace: {
      get textDocuments() {
        return mocks.textDocuments;
      },
      onDidOpenTextDocument: mocks.onDidOpenTextDocument,
      onDidChangeTextDocument: mocks.onDidChangeTextDocument,
      onDidCloseTextDocument: mocks.onDidCloseTextDocument,
    },
    CodeActionKind: {
      QuickFix: "quickfix",
    },
    Range: class FakeRange {
      constructor(
        public startLine: number,
        public startChar: number,
        public endLine: number,
        public endChar: number,
      ) {}
    },
    Diagnostic: class FakeDiagnostic {
      source: string | undefined;
      code: string | undefined;
      constructor(
        public range: any,
        public message: string,
        public severity: any,
      ) {}
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
    },
    Position: class FakePosition {
      constructor(
        public line: number,
        public character: number,
      ) {}
    },
    CompletionItem: class FakeCompletionItem {
      detail: string | undefined;
      constructor(public label: string) {}
    },
    Hover: class FakeHover {
      constructor(public contents: any) {}
    },
    MarkdownString: class FakeMarkdownString {
      constructor(public value: string) {}
    },
    CodeAction: class FakeCodeAction {
      diagnostics: any[] | undefined;
      edit: any;
      constructor(
        public title: string,
        public kind: any,
      ) {}
    },
    WorkspaceEdit: class FakeWorkspaceEdit {
      replacements: any[] = [];
      replace(uri: any, range: any, newText: string): void {
        this.replacements.push({ uri, range, newText });
      }
    },
  };
});

import { activate, deactivate } from "../extensions/vscode/src/extension.js";

const mockCollection = {
  set: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  dispose: vi.fn(),
};

const mockDisposable = {
  dispose: vi.fn(),
};

describe("VS Code Extension Lifecycle (extension.ts)", () => {
  let mockContext: { subscriptions: any[] };
  let onDidOpenTextDocumentCallback: ((doc: any) => void) | undefined;
  let onDidChangeTextDocumentCallback: ((event: any) => void) | undefined;
  let onDidCloseTextDocumentCallback: ((doc: any) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.textDocuments.length = 0;
    mockContext = { subscriptions: [] };

    // Setup return values for registration calls
    mocks.createDiagnosticCollection.mockReturnValue(mockCollection);
    mocks.registerCompletionItemProvider.mockReturnValue(mockDisposable);
    mocks.registerHoverProvider.mockReturnValue(mockDisposable);
    mocks.registerCodeActionsProvider.mockReturnValue(mockDisposable);

    // Capture event handler callbacks
    mocks.onDidOpenTextDocument.mockImplementation((cb) => {
      onDidOpenTextDocumentCallback = cb;
      return mockDisposable;
    });
    mocks.onDidChangeTextDocument.mockImplementation((cb) => {
      onDidChangeTextDocumentCallback = cb;
      return mockDisposable;
    });
    mocks.onDidCloseTextDocument.mockImplementation((cb) => {
      onDidCloseTextDocumentCallback = cb;
      return mockDisposable;
    });
  });

  it("activates successfully, registering diagnostic collection and language providers", () => {
    activate(mockContext as any);

    // Verify diagnostic collection creation and registration
    expect(mocks.createDiagnosticCollection).toHaveBeenCalledWith("quadlet-lint");
    expect(mockContext.subscriptions).toContain(mockCollection);

    // Verify workspace event listeners registrations
    expect(mocks.onDidOpenTextDocument).toHaveBeenCalledTimes(1);
    expect(mocks.onDidChangeTextDocument).toHaveBeenCalledTimes(1);
    expect(mocks.onDidCloseTextDocument).toHaveBeenCalledTimes(1);

    // Verify provider registrations
    expect(mocks.registerCompletionItemProvider).toHaveBeenCalledWith(
      "quadlet",
      expect.any(Object),
    );
    expect(mocks.registerHoverProvider).toHaveBeenCalledWith(
      "quadlet",
      expect.any(Object),
    );
    expect(mocks.registerCodeActionsProvider).toHaveBeenCalledWith(
      "quadlet",
      expect.any(Object),
      { providedCodeActionKinds: ["quickfix"] },
    );

    // All registered components should be pushed to subscriptions
    expect(mockContext.subscriptions).toContain(mockDisposable);
    expect(mockContext.subscriptions.length).toBeGreaterThanOrEqual(7);
  });

  it("processes pre-existing open documents on activation if they are Quadlet files", () => {
    const quadletDoc = {
      languageId: "quadlet",
      uri: { path: "/etc/containers/systemd/web.container" },
      getText: () => "[Container]\nImage=alpine\nPull=bogus\n",
    };
    const nonQuadletDoc = {
      languageId: "markdown",
      uri: { path: "/etc/containers/systemd/README.md" },
      getText: () => "# Hello",
    };

    mocks.textDocuments.push(quadletDoc, nonQuadletDoc);

    activate(mockContext as any);

    // Diagnostics should be published for the quadlet document
    expect(mockCollection.set).toHaveBeenCalledTimes(1);
    expect(mockCollection.set).toHaveBeenCalledWith(
      quadletDoc.uri,
      expect.any(Array),
    );
  });

  it("publishes diagnostics when a Quadlet document is opened", () => {
    activate(mockContext as any);
    expect(onDidOpenTextDocumentCallback).toBeDefined();

    const quadletDoc = {
      languageId: "quadlet",
      uri: { path: "/etc/containers/systemd/web.container" },
      getText: () => "[Container]\nImage=alpine\nPull=bogus\n",
    };

    onDidOpenTextDocumentCallback!(quadletDoc);
    expect(mockCollection.set).toHaveBeenCalledTimes(1);
    expect(mockCollection.set).toHaveBeenCalledWith(
      quadletDoc.uri,
      expect.any(Array),
    );

    // Non-quadlet document should not trigger diagnostic refresh
    mockCollection.set.mockClear();
    const nonQuadletDoc = {
      languageId: "javascript",
      uri: { path: "/demo.js" },
      getText: () => "console.log()",
    };
    onDidOpenTextDocumentCallback!(nonQuadletDoc);
    expect(mockCollection.set).not.toHaveBeenCalled();
  });

  it("publishes diagnostics when a Quadlet document changes", () => {
    activate(mockContext as any);
    expect(onDidChangeTextDocumentCallback).toBeDefined();

    const quadletDoc = {
      languageId: "quadlet",
      uri: { path: "/etc/containers/systemd/web.container" },
      getText: () => "[Container]\nImage=alpine\nPull=bogus\n",
    };

    onDidChangeTextDocumentCallback!({ document: quadletDoc });
    expect(mockCollection.set).toHaveBeenCalledTimes(1);
    expect(mockCollection.set).toHaveBeenCalledWith(
      quadletDoc.uri,
      expect.any(Array),
    );

    // Non-quadlet document change should not trigger diagnostic refresh
    mockCollection.set.mockClear();
    const nonQuadletDoc = {
      languageId: "javascript",
      uri: { path: "/demo.js" },
      getText: () => "console.log()",
    };
    onDidChangeTextDocumentCallback!({ document: nonQuadletDoc });
    expect(mockCollection.set).not.toHaveBeenCalled();
  });

  it("clears diagnostics when a document is closed", () => {
    activate(mockContext as any);
    expect(onDidCloseTextDocumentCallback).toBeDefined();

    const quadletDoc = {
      languageId: "quadlet",
      uri: { path: "/etc/containers/systemd/web.container" },
      getText: () => "[Container]\n",
    };

    onDidCloseTextDocumentCallback!(quadletDoc);
    expect(mockCollection.delete).toHaveBeenCalledTimes(1);
    expect(mockCollection.delete).toHaveBeenCalledWith(quadletDoc.uri);
  });

  it("deactivates successfully without throwing errors", () => {
    expect(() => deactivate()).not.toThrow();
  });
});
