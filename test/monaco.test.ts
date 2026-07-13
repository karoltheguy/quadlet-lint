import { describe, it, expect, vi } from "vitest";
import { toMarkers, lintModel, OWNER } from "../src/monaco.js";

// Minimal stand-ins for the slice of Monaco the adapter touches. This keeps the
// test dependency-free — no real editor/DOM required.
const MarkerSeverity = { Error: 8, Warning: 4 } as const;

function fakeMonaco(setModelMarkers = vi.fn()) {
  return {
    MarkerSeverity,
    editor: { setModelMarkers },
  } as any;
}

function fakeModel(value: string) {
  return { getValue: () => value } as any;
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
