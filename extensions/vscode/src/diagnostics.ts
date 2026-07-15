/**
 * VS Code adapter for quadlet-lint.
 *
 * This is a thin binding over the pure core: it converts {@link Diagnostic}s
 * into `vscode.Diagnostic` instances and publishes them onto a
 * `DiagnosticCollection`. Mirrors the dependency-injection pattern used by
 * `src/monaco.ts` — adapter functions accept an injected namespace object
 * instead of importing the `vscode` runtime, so they're unit-testable with
 * fakes.
 */

import { lintQuadlet, type Diagnostic } from "../../../src/index.js";

/** Default diagnostic source string, mirroring the Monaco adapter's `OWNER`. */
export const SOURCE = "quadlet-lint";

/**
 * The slice of the `vscode` namespace this adapter needs. Accepting it as an
 * argument (rather than importing the runtime) keeps the adapter agnostic to
 * how it was loaded/tested.
 */
export interface VscodeLike {
  Range: new (
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number,
  ) => unknown;
  Diagnostic: new (
    range: any,
    message: string,
    severity: any,
  ) => { source?: string; code?: any };
  DiagnosticSeverity: {
    Error: unknown;
    Warning: unknown;
  };
}

/** Convert a list of diagnostics into `vscode.Diagnostic` instances. */
export function toVsDiagnostics(
  vscodeNs: VscodeLike,
  diagnostics: Diagnostic[],
): unknown[] {
  return diagnostics.map((d) => {
    const range = new vscodeNs.Range(
      d.line - 1,
      d.startColumn - 1,
      d.line - 1,
      d.endColumn - 1,
    );
    const severity =
      d.severity === "error"
        ? vscodeNs.DiagnosticSeverity.Error
        : vscodeNs.DiagnosticSeverity.Warning;
    const vsDiag = new vscodeNs.Diagnostic(range, d.message, severity);
    vsDiag.code = d.code;
    vsDiag.source = SOURCE;
    return vsDiag;
  });
}

/**
 * Lint a document's current text and publish the results onto a
 * `DiagnosticCollection`.
 *
 * @returns the diagnostics that were published (handy for testing/telemetry).
 */
export function refreshDiagnostics(
  vscodeNs: VscodeLike,
  collection: { set(uri: unknown, diags: unknown[]): void },
  document: { getText(): string; uri: { path: string } },
): unknown[] {
  const diagnostics = lintQuadlet(document.getText(), {
    fileName: document.uri.path,
  });
  const converted = toVsDiagnostics(vscodeNs, diagnostics);
  collection.set(document.uri, converted);
  return converted;
}
