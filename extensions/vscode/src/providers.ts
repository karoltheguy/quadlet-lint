/**
 * VS Code language-feature providers for quadlet-lint (completions, hover,
 * code actions).
 *
 * Mirrors the dependency-injection pattern used by `src/monaco.ts` and
 * `extensions/vscode/src/diagnostics.ts` — adapter functions accept an
 * injected namespace object instead of importing the `vscode` runtime, so
 * they're unit-testable with fakes.
 */

import { getCompletions, getHover, getQuickFixes } from "../../../src/service.js";
import type { Diagnostic } from "../../../src/index.js";

/** 0-based line/character position, matching `vscode.Position`. */
export interface VscodePosition {
  line: number;
  character: number;
}

/** 0-based document, matching the slice of `vscode.TextDocument` needed here. */
export interface VscodeDocument {
  getText(): string;
  uri: { path: string };
}

/** The slice of a `vscode.Diagnostic` this adapter reads. */
export interface VscodeDiagnosticLike {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  code?: unknown;
  source?: string;
  severity?: unknown;
}

/** The slice of a `vscode.CodeActionContext` this adapter needs. */
export interface VscodeCodeActionContext {
  diagnostics: VscodeDiagnosticLike[];
}

/**
 * The slice of the `vscode` namespace these providers need. Accepting it as
 * an argument (rather than importing the runtime) keeps the adapter agnostic
 * to how it was loaded/tested.
 */
export interface VscodeLike {
  Range: new (
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number,
  ) => unknown;
  Position: new (line: number, character: number) => unknown;
  CompletionItem: new (label: string) => { label: string; detail?: string; insertText?: unknown };
  Hover: new (contents: unknown) => unknown;
  MarkdownString: new (value: string) => unknown;
  SnippetString: new (value: string) => unknown;
  CodeAction: new (
    title: string,
    kind: unknown,
  ) => { title: string; kind: unknown; diagnostics?: unknown[]; edit?: unknown };
  CodeActionKind: {
    QuickFix: unknown;
  };
  WorkspaceEdit: new () => {
    replace(uri: unknown, range: unknown, newText: string): void;
  };
}

/** Convert a diagnostic's `code` (string, number, or `{ value }`) into a plain string. */
function diagnosticCode(code: unknown): string {
  return typeof code === "object" && code !== null
    ? String((code as { value: unknown }).value)
    : String(code ?? "");
}

/** A `vscode.CompletionItemProvider`-shaped object. */
export interface CompletionProvider {
  provideCompletionItems(
    document: VscodeDocument,
    position: VscodePosition,
  ): unknown[];
}

/** A `vscode.HoverProvider`-shaped object. */
export interface HoverProvider {
  provideHover(document: VscodeDocument, position: VscodePosition): unknown;
}

/** A `vscode.CodeActionProvider`-shaped object. */
export interface CodeActionProvider {
  provideCodeActions(
    document: VscodeDocument,
    range: unknown,
    context: VscodeCodeActionContext,
  ): unknown[];
}

/**
 * Create a completion provider that suggests section names, keys, and enum
 * values from {@link getCompletions}.
 */
export function createCompletionProvider(vscodeNs: VscodeLike): CompletionProvider {
  return {
    provideCompletionItems(document, position) {
      const items = getCompletions(
        document.getText(),
        { line: position.line + 1, column: position.character + 1 },
        document.uri.path,
      );
      return items.map((item) => {
        const completionItem = new vscodeNs.CompletionItem(item.label);
        if (item.detail !== undefined) {
          completionItem.detail = item.detail;
        }
        if (item.snippet !== undefined) {
          completionItem.insertText = new vscodeNs.SnippetString(item.snippet);
        }
        return completionItem;
      });
    },
  };
}

/**
 * Create a hover provider that surfaces key documentation from
 * {@link getHover}.
 */
export function createHoverProvider(vscodeNs: VscodeLike): HoverProvider {
  return {
    provideHover(document, position) {
      const info = getHover(document.getText(), {
        line: position.line + 1,
        column: position.character + 1,
      });
      if (info === null) return null;

      const contents = [new vscodeNs.MarkdownString(`**${info.section} / ${info.key}**`)];
      if (info.description !== null) {
        contents.push(new vscodeNs.MarkdownString(info.description));
      }
      return new vscodeNs.Hover(contents);
    },
  };
}

/**
 * Create a code action provider that offers quick fixes from
 * {@link getQuickFixes}.
 */
export function createCodeActionProvider(vscodeNs: VscodeLike): CodeActionProvider {
  return {
    provideCodeActions(document, _range, context) {
      const text = document.getText();
      const actions: unknown[] = [];

      for (const d of context.diagnostics) {
        if (d.source !== "quadlet-lint") continue;

        const diagnostic: Diagnostic = {
          line: d.range.start.line + 1,
          startColumn: d.range.start.character + 1,
          endColumn: d.range.end.character + 1,
          severity: "warning",
          code: diagnosticCode(d.code),
          message: d.message ?? "",
        };

        const fixes = getQuickFixes(text, diagnostic, document.uri.path);
        for (const fix of fixes) {
          const action = new vscodeNs.CodeAction(fix.title, vscodeNs.CodeActionKind.QuickFix);
          action.diagnostics = [d];
          const edit = new vscodeNs.WorkspaceEdit();
          for (const e of fix.edits) {
            edit.replace(
              document.uri,
              new vscodeNs.Range(e.line - 1, e.startColumn - 1, e.line - 1, e.endColumn - 1),
              e.newText,
            );
          }
          action.edit = edit;
          actions.push(action);
        }
      }

      return actions;
    },
  };
}
