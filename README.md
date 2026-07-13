# quadlet-lint

Fast, dependency-free linting for Podman [Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) unit files (`.container`, `.pod`, `.network`, `.volume`, `.kube`, `.build`, `.image`), with an adapter for the [Monaco Editor](https://microsoft.github.io/monaco-editor/) (and, on the roadmap, VS Code).

Quadlet files are systemd units, and the authoritative check will always be `podman system generate --dryrun`. But the generator needs Podman on the host and a round-trip. **quadlet-lint gives instant, as-you-type feedback for the mistakes that don't need Podman to detect** — and nothing else.

Its guiding promise: **zero false errors.** Anything it reports as an `error` would genuinely fail systemd/Quadlet; anything uncertain is at most a `warning`. It is convenience feedback, not a verdict.

## Install

```sh
npm install quadlet-lint
```

The core has no runtime dependencies. `monaco-editor` is an **optional peer dependency**, needed only if you import the `quadlet-lint/monaco` adapter.

## Core usage

The core is a pure function — no editor, no DOM:

```ts
import { lintQuadlet } from "quadlet-lint";

const diagnostics = lintQuadlet(text);
// → [{ line, startColumn, endColumn, severity: "error" | "warning", code, message }]
```

All positions are **1-based**, matching Monaco: `startColumn` is the first character, `endColumn` is just past the last (exclusive).

## Monaco usage

The Monaco binding is a thin adapter over the core. Pass in your Monaco namespace so the adapter stays agnostic to how Monaco was loaded (bundler, AMD, CDN):

```ts
import * as monaco from "monaco-editor";
import { lintModel } from "quadlet-lint/monaco";

const model = editor.getModel()!;
lintModel(monaco, model);                              // lint now
model.onDidChangeContent(() => lintModel(monaco, model)); // ...and on every edit
```

`lintModel` publishes results via `setModelMarkers(model, "quadlet-lint", …)`. If you want the markers without publishing them, use `toMarkers(monaco, lintQuadlet(text))`.

## What it checks

| Code    | Severity  | Rule |
|---------|-----------|------|
| `QL001` | error     | A non-blank, non-comment line that is neither a `[Section]` header nor a `Key=Value` pair (systemd rejects it: *"Missing '=' character"*). |
| `QL002` | error     | An assignment that appears before any `[Section]` header (*"Assignment outside of section"*). |
| `QL010` | warning   | An unknown section (a typo like `[Continer]`, or a section for the wrong file type). `X-` user sections are always allowed. |
| `QL020` | warning   | A duplicate of a key that is **known to be single-valued** — so the last-one-wins behavior is almost certainly a mistake. |

Diagnostic codes are exported as `Codes` for programmatic use.

### Why duplicate detection is conservative

Many Quadlet keys legitimately repeat and accumulate (`Volume=`, `PublishPort=`, `Environment=`, `Label=`, `AddCapability=`, …). Flagging every duplicate would produce constant false positives. So `QL020` only fires for a curated set of keys we are confident are single-valued (see [`src/sections.ts`](src/sections.ts)). A key we haven't classified is assumed possibly-repeatable and never flagged.

## Roadmap

- **Per-section key-name validation**, sourced from the Podman docs tables (kept as a warning — the risk of false positives on new/unknown keys is high).
- **`quadlet-lint-vscode`** — a VS Code extension over the Diagnostics API, reusing this same core.

## Non-goals

- Replacing `podman system generate --dryrun` — semantic validation stays with Podman.
- General systemd unit linting — scoped to Quadlet file types.

## Development

```sh
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest — pure-function tests, no editor needed
npm run build       # tsup → dist (ESM + CJS + .d.ts)
```

## License

GPL-3.0-or-later. (Note: if you intend to publish the eventual VS Code extension to the Marketplace, a permissive license such as MIT is friendlier there — worth reconsidering before the `quadlet-lint-vscode` package ships.)
