import { describe, it, expect, vi } from "vitest";
import { lintQuadlet } from "../src/index.js";
import { refreshDiagnostics, SOURCE } from "../extensions/vscode/src/diagnostics.js";

// Minimal stand-ins for the slice of the `vscode` API the adapter touches.
// This keeps the test dependency-free — no real extension host required.
class FakeRange {
  constructor(
    public startLine: number,
    public startChar: number,
    public endLine: number,
    public endChar: number,
  ) {}
}

class FakeDiagnostic {
  source: string | undefined;
  code: string | undefined;
  constructor(
    public range: FakeRange,
    public message: string,
    public severity: unknown,
  ) {}
}

const DiagnosticSeverity = { Error: 0, Warning: 1 } as const;

function fakeVscode() {
  return {
    Range: FakeRange,
    Diagnostic: FakeDiagnostic,
    DiagnosticSeverity,
  } as any;
}

const text = "[Container]\nImage=alpine\nPull=bogus\n";
const fileName = "/etc/containers/systemd/web.container";

function fakeDocument() {
  return {
    getText: () => text,
    uri: { path: fileName },
  };
}

describe("refreshDiagnostics", () => {
  it("lints the document and publishes diagnostics onto the collection", () => {
    const expected = lintQuadlet(text, { fileName });
    expect(expected.length).toBeGreaterThan(0);
    const pullDiagnostic = expected.find((d) => d.code === "QL040");
    expect(pullDiagnostic).toBeDefined();
    expect(pullDiagnostic!.message).toContain("bogus");

    const vscodeNs = fakeVscode();
    const set = vi.fn();
    const collection = { set };
    const document = fakeDocument();

    const published = refreshDiagnostics(vscodeNs, collection, document);

    expect(set).toHaveBeenCalledTimes(1);
    const [uri, publishedArg] = set.mock.calls[0]!;
    expect(uri).toBe(document.uri);
    expect(publishedArg).toHaveLength(expected.length);

    for (let i = 0; i < expected.length; i++) {
      const d = expected[i]!;
      const vsDiag = publishedArg[i] as FakeDiagnostic;
      expect(vsDiag.range).toEqual(
        new FakeRange(d.line - 1, d.startColumn - 1, d.line - 1, d.endColumn - 1),
      );
      expect(vsDiag.message).toBe(d.message);
      expect(vsDiag.severity).toBe(
        d.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
      );
      expect(vsDiag.code).toBe(d.code);
      expect(vsDiag.source).toBe(SOURCE);
    }

    expect(published).toEqual(publishedArg);
  });
});
