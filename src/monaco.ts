/**
 * Monaco Editor adapter for quadlet-lint.
 *
 * This is a thin binding over the pure core: it converts {@link Diagnostic}s
 * into Monaco marker data and, optionally, pushes them onto a model. Monaco is
 * an optional peer dependency — only import this entry point if you use Monaco.
 */

import type * as monaco from "monaco-editor";
import { lintQuadlet, type Diagnostic } from "./index.js";
import { getCompletions, getHover, getQuickFixes } from "./service.js";

export { lintQuadlet } from "./index.js";
export type { Diagnostic, Severity } from "./index.js";

/** Default marker owner string passed to `setModelMarkers`. */
export const OWNER = "quadlet-lint";

/**
 * The slice of the Monaco namespace this adapter needs. Accepting it as an
 * argument (rather than importing the runtime) keeps the adapter agnostic to
 * how Monaco was loaded (bundler, AMD loader, CDN, etc.).
 */
export interface MonacoLike {
  MarkerSeverity: typeof monaco.MarkerSeverity;
  editor: Pick<typeof monaco.editor, "setModelMarkers">;
  languages: Pick<
    typeof monaco.languages,
    | "registerCompletionItemProvider"
    | "registerHoverProvider"
    | "registerCodeActionProvider"
    | "CompletionItemKind"
    | "CompletionItemInsertTextRule"
  >;
}

/** Derive a lint-friendly file name from a Monaco model's URI. */
function fileNameFrom(uri: { path: string }): string {
  return uri.path;
}

/** Convert a marker's `code` (string or `{ value }`) into a plain string. */
function markerCode(code: monaco.editor.IMarkerData["code"]): string {
  return typeof code === "object" && code !== null ? code.value : String(code ?? "");
}

/** Convert a single diagnostic into Monaco marker data. */
export function toMarker(
  monacoNs: Pick<MonacoLike, "MarkerSeverity">,
  d: Diagnostic,
): monaco.editor.IMarkerData {
  return {
    severity:
      d.severity === "error"
        ? monacoNs.MarkerSeverity.Error
        : monacoNs.MarkerSeverity.Warning,
    message: d.message,
    code: d.code,
    startLineNumber: d.line,
    startColumn: d.startColumn,
    endLineNumber: d.line,
    endColumn: d.endColumn,
    source: OWNER,
  };
}

/** Convert a list of diagnostics into Monaco marker data. */
export function toMarkers(
  monacoNs: Pick<MonacoLike, "MarkerSeverity">,
  diagnostics: Diagnostic[],
): monaco.editor.IMarkerData[] {
  return diagnostics.map((d) => toMarker(monacoNs, d));
}

/**
 * Lint a model's current text and publish the results as markers.
 *
 * Typical wiring:
 *
 * ```ts
 * import * as monaco from "monaco-editor";
 * import { lintModel } from "quadlet-lint/monaco";
 *
 * const model = editor.getModel()!;
 * lintModel(monaco, model);
 * model.onDidChangeContent(() => lintModel(monaco, model));
 * ```
 *
 * @returns the diagnostics that were published (handy for testing/telemetry).
 */
export function lintModel(
  monacoNs: MonacoLike,
  model: monaco.editor.ITextModel,
  owner: string = OWNER,
): Diagnostic[] {
  const fileName = model.uri ? fileNameFrom(model.uri) : undefined;
  const diagnostics = lintQuadlet(model.getValue(), { fileName });
  monacoNs.editor.setModelMarkers(model, owner, toMarkers(monacoNs, diagnostics));
  return diagnostics;
}

/**
 * Register a completion provider for `languageId` that suggests section
 * names, keys, and enum values from {@link getCompletions}.
 */
export function registerCompletionProvider(
  monacoNs: Pick<MonacoLike, "languages">,
  languageId: string,
): monaco.IDisposable {
  return monacoNs.languages.registerCompletionItemProvider(languageId, {
    provideCompletionItems(model, position) {
      const items = getCompletions(
        model.getValue(),
        { line: position.lineNumber, column: position.column },
        fileNameFrom(model.uri),
      );
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const suggestions = items.map((item) => ({
        label: item.label,
        kind: monacoNs.languages.CompletionItemKind.Property,
        insertText: item.snippet ?? item.label,
        ...(item.snippet !== undefined
          ? { insertTextRules: monacoNs.languages.CompletionItemInsertTextRule.InsertAsSnippet }
          : {}),
        range,
      }));
      return { suggestions };
    },
  });
}

/**
 * Register a hover provider for `languageId` that surfaces key
 * documentation from {@link getHover}.
 */
export function registerHoverProvider(
  monacoNs: Pick<MonacoLike, "languages">,
  languageId: string,
): monaco.IDisposable {
  return monacoNs.languages.registerHoverProvider(languageId, {
    provideHover(model, position) {
      const info = getHover(model.getValue(), {
        line: position.lineNumber,
        column: position.column,
      });
      if (info === null) return null;

      const contents = [{ value: `**${info.section} / ${info.key}**` }];
      if (info.description !== null) {
        contents.push({ value: info.description });
      }
      return { contents };
    },
  });
}

/**
 * Register a code action provider for `languageId` that offers quick fixes
 * (typo'd sections and keys, enum values, and file-type section mismatches)
 * from {@link getQuickFixes}.
 */
export function registerCodeActionProvider(
  monacoNs: Pick<MonacoLike, "languages">,
  languageId: string,
): monaco.IDisposable {
  return monacoNs.languages.registerCodeActionProvider(languageId, {
    provideCodeActions(model, _range, context) {
      const actions = context.markers.flatMap((marker) => {
        const diagnostic: Diagnostic = {
          line: marker.startLineNumber,
          startColumn: marker.startColumn,
          endColumn: marker.endColumn,
          severity: "warning",
          code: markerCode(marker.code),
          message: marker.message ?? "",
        };
        const fixes = getQuickFixes(model.getValue(), diagnostic, model.uri ? fileNameFrom(model.uri) : undefined);
        return fixes.map((fix) => ({
          title: fix.title,
          kind: "quickfix",
          diagnostics: [marker],
          edit: {
            edits: fix.edits.map((e) => ({
              resource: model.uri,
              textEdit: {
                range: {
                  startLineNumber: e.line,
                  startColumn: e.startColumn,
                  endLineNumber: e.line,
                  endColumn: e.endColumn,
                },
                text: e.newText,
              },
              versionId: undefined,
            })),
          },
        }));
      });
      return { actions, dispose() {} };
    },
  });
}
