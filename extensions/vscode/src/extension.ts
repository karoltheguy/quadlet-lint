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
}

export function deactivate(): void {}
