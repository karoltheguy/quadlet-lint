import * as monaco from "monaco-editor";
import { lintModel } from "../src/monaco.js";

const sample = `[Unit]
Description=Demo container

[Container]
Image=docker.io/library/nginx
PublishPort=8080:80
Exec=

[Service]
Restart=always

[Install]
WantedBy=multi-user.target
`;

const model = monaco.editor.createModel(sample, undefined, monaco.Uri.file("demo.container"));

monaco.editor.create(document.getElementById("editor")!, {
  model,
  automaticLayout: true,
});

lintModel(monaco, model);
model.onDidChangeContent(() => lintModel(monaco, model));
