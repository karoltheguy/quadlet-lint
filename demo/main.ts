import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/ini/ini.contribution";
import {
  lintModel,
  registerCompletionProvider,
  registerHoverProvider,
  registerCodeActionProvider,
} from "../src/monaco.js";

self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

(window as any).monaco = monaco;

// Template snippets for Quadlet file types
const templates: Record<string, string> = {
  container: `[Unit]
Description=Demo web app service

[Container]
# QL020: duplicate of a single-valued key
Image=docker.io/library/nginx
Image=docker.io/library/nginx:1.27
# QL030: unknown key (typo of Environment=)
Enviroment=FOO=bar
PublishPort=8080:80
# QL040: value outside documented closed set
Pull=sometimes
# QL001: not a Key=Value pair, a section, or a comment
oops this line has no equals sign

# QL010: unknown section (typo of [Install])
[Instal]
WantedBy=multi-user.target
`,
  volume: `[Unit]
Description=Database Volume storage

[Volume]
# QL061: Driver=image requires Image= key to be set
Driver=image
# Add standard volume label
Label=service-data-volume
`,
  network: `[Unit]
Description=Isolated container network

[Network]
# QL061: Gateway= requires Subnet= to be declared
Gateway=10.10.10.1
# QL030: Typo in key name
SubnetMask=255.255.255.0
`,
  pod: `[Unit]
Description=Multi-container Pod group

[Pod]
# QL020: duplicate single-valued key
Network=host
Network=bridge
`
};

// Examples triggered by clicking the rules cards
const ruleExamples: Record<string, { fileName: string; content: string }> = {
  QL001: {
    fileName: "demo.container",
    content: `[Unit]
Description=Malformed line example

[Container]
Image=docker.io/library/nginx:1.27
this line is completely broken because it has no equals sign
`
  },
  QL002: {
    fileName: "demo.container",
    content: `Image=docker.io/library/nginx:1.27
[Container]
`
  },
  QL010: {
    fileName: "demo.container",
    content: `[Unit]
Description=Typo in section header

[Continer]
Image=docker.io/library/nginx:1.27
`
  },
  QL020: {
    fileName: "demo.container",
    content: `[Unit]
Description=Duplicate single-valued key

[Container]
Image=docker.io/library/nginx
Image=docker.io/library/nginx:1.27
`
  },
  QL030: {
    fileName: "demo.container",
    content: `[Unit]
Description=Typo in key name

[Container]
Image=docker.io/library/nginx:1.27
# Hover over Enviroment or click the lightbulb for quick fix:
Enviroment=DB_PORT=5432
`
  },
  QL040: {
    fileName: "demo.container",
    content: `[Unit]
Description=Invalid enum value

[Container]
Image=docker.io/library/nginx:1.27
Pull=sometimes
`
  },
  QL050: {
    fileName: "demo.volume",
    content: `[Unit]
Description=Mismatched section for .volume extension

[Container]
Image=docker.io/library/nginx:1.27
`
  },
  QL060: {
    fileName: "demo.container",
    content: `[Unit]
Description=Missing required Image or Rootfs key

[Container]
# Image= is missing here!
PublishPort=8080:80
`
  },
  QL061: {
    fileName: "demo.volume",
    content: `[Unit]
Description=Unmet conditional requirement

[Volume]
Driver=image
# Since Driver=image is specified, Image= is required but missing!
`
  },
  QL070: {
    fileName: "demo.container",
    content: `[Unit]
Description=Conflicting keys

[Container]
Image=docker.io/library/nginx:1.27
Rootfs=/var/lib/nginx
`
  }
};

// Initialize editor model
const model = monaco.editor.createModel(templates.container, "ini", monaco.Uri.file("demo.container"));

// Create the Monaco editor
const editor = monaco.editor.create(document.getElementById("editor")!, {
  model,
  automaticLayout: true,
  theme: "vs-dark",
  minimap: { enabled: false },
  scrollbar: {
    vertical: "visible",
    horizontal: "visible"
  },
  fontSize: 14,
  fontFamily: "'JetBrains Mono', monospace",
  lineHeight: 20,
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on"
});

// Register autocomplete, hover documentation, and quick-fixes
registerCompletionProvider(monaco, "ini");
registerHoverProvider(monaco, "ini");
registerCodeActionProvider(monaco, "ini");

// Perform linting and update UI counts
function runLintAndUI() {
  const currentModel = editor.getModel();
  if (!currentModel) return;

  lintModel(monaco, currentModel);
  const markers = monaco.editor.getModelMarkers({ owner: "quadlet-lint", resource: currentModel.uri });
  
  let errors = 0;
  let warnings = 0;
  for (const marker of markers) {
    if (marker.severity === monaco.MarkerSeverity.Error) {
      errors++;
    } else if (marker.severity === monaco.MarkerSeverity.Warning) {
      warnings++;
    }
  }

  document.getElementById("error-count")!.innerText = String(errors);
  document.getElementById("warning-count")!.innerText = String(warnings);

  const statusMsg = document.getElementById("editor-status-msg")!;
  if (errors > 0) {
    statusMsg.innerText = `Detected ${errors} error(s)`;
    statusMsg.style.color = "var(--error)";
  } else if (warnings > 0) {
    statusMsg.innerText = `Detected ${warnings} warning(s)`;
    statusMsg.style.color = "var(--warning)";
  } else {
    statusMsg.innerText = "All systems normal";
    statusMsg.style.color = "var(--success)";
  }
}

// Bind linter to content changes
model.onDidChangeContent(() => runLintAndUI());
runLintAndUI();

let currentTemplateName = "container"; // track current template for Reset

// Switch model and load templates
function switchTemplate(templateName: string) {
  currentTemplateName = templateName;

  // Update titlebar filename
  const filename = `demo.${templateName}`;
  document.getElementById("titlebar-filename")!.innerText = filename;

  // Update active editor tab class
  const editorTabsList = document.querySelectorAll(".editor-tab");
  editorTabsList.forEach((tab) => {
    const tabFile = tab.getAttribute("data-tab-file");
    if (tabFile === templateName) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  const content = templates[templateName] || "";
  const oldModel = editor.getModel();
  const newModel = monaco.editor.createModel(
    content,
    "ini",
    monaco.Uri.file(filename)
  );
  editor.setModel(newModel);
  if (oldModel) oldModel.dispose();

  newModel.onDidChangeContent(() => runLintAndUI());
  runLintAndUI();
}

// UI: Editor Tabs click
const editorTabsList = document.querySelectorAll(".editor-tab");
editorTabsList.forEach((tab) => {
  tab.addEventListener("click", () => {
    const templateName = tab.getAttribute("data-tab-file")!;
    switchTemplate(templateName);
  });
});

// UI: Template buttons click
const templateButtons = document.querySelectorAll(".template-btn");
templateButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const templateName = btn.getAttribute("data-template")!;
    switchTemplate(templateName);
  });
});

// UI: Tab switching logic (sidebar)
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetTabId = btn.getAttribute("data-tab")!;

    tabButtons.forEach((b) => b.classList.remove("active"));
    tabContents.forEach((c) => c.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById(targetTabId)!.classList.add("active");
  });
});

// UI: Rules cards interactivity
const ruleCards = document.querySelectorAll(".rule-card");
ruleCards.forEach((card) => {
  card.addEventListener("click", () => {
    const ruleCode = card.getAttribute("data-rule")!;
    const example = ruleExamples[ruleCode];
    if (example) {
      const templateName = example.fileName.split(".")[1]!;
      currentTemplateName = templateName;

      // Update titlebar filename
      document.getElementById("titlebar-filename")!.innerText = example.fileName;

      // Update active editor tab class
      const editorTabsList = document.querySelectorAll(".editor-tab");
      editorTabsList.forEach((tab) => {
        const tabFile = tab.getAttribute("data-tab-file");
        if (tabFile === templateName) {
          tab.classList.add("active");
        } else {
          tab.classList.remove("active");
        }
      });

      const oldModel = editor.getModel();
      const newModel = monaco.editor.createModel(
        example.content,
        "ini",
        monaco.Uri.file(example.fileName)
      );
      editor.setModel(newModel);
      if (oldModel) oldModel.dispose();

      newModel.onDidChangeContent(() => runLintAndUI());
      runLintAndUI();
    }
  });
});

// UI: Action footer buttons
document.getElementById("btn-clear")!.addEventListener("click", () => {
  editor.setValue("");
});

document.getElementById("btn-reset")!.addEventListener("click", () => {
  editor.setValue(templates[currentTemplateName] || "");
});

document.getElementById("btn-copy")!.addEventListener("click", () => {
  const text = editor.getValue();
  navigator.clipboard.writeText(text);
  const copyBtn = document.getElementById("btn-copy")!;
  copyBtn.innerText = "Copied!";
  setTimeout(() => {
    copyBtn.innerText = "Copy Code";
  }, 2000);
});
