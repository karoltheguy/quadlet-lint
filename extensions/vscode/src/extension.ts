/**
 * VS Code extension entry point.
 *
 * Thin wiring around the {@link refreshDiagnostics} adapter: creates a
 * diagnostic collection, keeps it in sync with already-open and
 * subsequently opened/changed quadlet documents, and clears entries when
 * documents are closed.
 */

import * as vscode from "vscode";
import { refreshDiagnostics } from "./diagnostics.js";
import {
  createCompletionProvider,
  createHoverProvider,
  createCodeActionProvider,
  type VscodeLike,
} from "./providers.js";

/**
 * The real `vscode` namespace's shapes for `CompletionItem`, `Hover`, and
 * `CodeAction` are wider than the minimal {@link VscodeLike} contract the
 * providers are tested against (e.g. `CompletionItem`'s label accepts a
 * `CompletionItemLabel` in addition to a plain string). Narrowing the
 * namespace to `VscodeLike` — and widening the resulting provider back to
 * the real `vscode` provider interfaces — bridges that gap without loosening
 * the DI contract the unit tests rely on.
 */
const vscodeNs = vscode as unknown as VscodeLike;

const QUADLET_LANGUAGE_ID = "quadlet";

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("quadlet-lint");
  context.subscriptions.push(collection);

  for (const document of vscode.workspace.textDocuments) {
    if (document.languageId === QUADLET_LANGUAGE_ID) {
      refreshDiagnostics(vscode, collection, document);
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === QUADLET_LANGUAGE_ID) {
        refreshDiagnostics(vscode, collection, document);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === QUADLET_LANGUAGE_ID) {
        refreshDiagnostics(vscode, collection, event.document);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      collection.delete(document.uri);
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      QUADLET_LANGUAGE_ID,
      createCompletionProvider(vscodeNs) as vscode.CompletionItemProvider,
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      QUADLET_LANGUAGE_ID,
      createHoverProvider(vscodeNs) as vscode.HoverProvider,
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      QUADLET_LANGUAGE_ID,
      createCodeActionProvider(vscodeNs) as unknown as vscode.CodeActionProvider,
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
  );
}

export function deactivate(): void {}
