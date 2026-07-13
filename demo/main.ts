import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import * as monaco from "monaco-editor";
import { lintModel } from "../src/monaco.js";

self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

(window as any).monaco = monaco;

// A deliberately-flawed unit file so the linter has something to show on load.
// Each planted mistake exercises a different rule — edit away the mistakes and
// watch the squiggles disappear.
const sample = `[Unit]
Description=Demo web app

[Container]
# QL020: duplicate of a single-valued key (the last Image= wins)
Image=docker.io/library/nginx
Image=docker.io/library/nginx:1.27
# QL030: unknown key (typo of Environment=)
Enviroment=FOO=bar
PublishPort=8080:80
# QL001: not a Key=Value pair, a section, or a comment
oops this line has no equals sign

# QL010: unknown section (typo of [Install])
[Instal]
WantedBy=multi-user.target
`;

const model = monaco.editor.createModel(sample, undefined, monaco.Uri.file("demo.container"));

monaco.editor.create(document.getElementById("editor")!, {
  model,
  automaticLayout: true,
});

lintModel(monaco, model);
model.onDidChangeContent(() => lintModel(monaco, model));
