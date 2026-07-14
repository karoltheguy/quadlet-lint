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

// Pass the file name to also get section ↔ file-type cross-checks (QL050):
const withFileChecks = lintQuadlet(text, { fileName: "web.container" });
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

Beyond markers, the adapter can register language providers for completions (sections, keys, and enum values), hover documentation, and quick fixes (e.g. rewriting a typo'd key). Providers register per language ID, so give your model a language (the built-in `ini` works well for unit files):

```ts
import { registerCompletionProvider, registerHoverProvider, registerCodeActionProvider } from "quadlet-lint/monaco";

registerCompletionProvider(monaco, "ini");
registerHoverProvider(monaco, "ini");
registerCodeActionProvider(monaco, "ini");
```

Completions are file-type aware when the model's URI has a Quadlet extension (e.g. `web.container` won't suggest `[Pod]`).

## What it checks

| Code    | Severity  | Rule |
|---------|-----------|------|
| `QL001` | error     | A non-blank, non-comment line that is neither a `[Section]` header nor a `Key=Value` pair (systemd rejects it: *"Missing '=' character"*). |
| `QL002` | error     | An assignment that appears before any `[Section]` header (*"Assignment outside of section"*). |
| `QL010` | warning   | An unknown section (a typo like `[Continer]`, or a section for the wrong file type). `X-` user sections are always allowed. |
| `QL020` | warning   | A duplicate of a key that is **known to be single-valued** — so the last-one-wins behavior is almost certainly a mistake. |
| `QL030` | warning   | A key that is **not documented for its section** (a typo, or an option from a newer Podman than this build knows). Only Quadlet-specific sections are checked. |
| `QL040` | warning   | A value outside the **known closed value set** for its key (e.g. `Pull=sometimes`), from a small hand-curated enum table. Values compare case-insensitively. |
| `QL050` | warning / error | Only when a `fileName` is passed: a file-type-specific section that doesn't match the file's type (warning — the section is ignored), or the expected section missing entirely (error — Quadlet fails to generate a service). Drop-in `.conf` files are recognized via their `<type>.d` parent directory and are exempt from the missing-section error. |

Diagnostic codes are exported as `Codes` for programmatic use.

### Why key checks are conservative

The key and value rules are warnings, never errors, and all lean toward silence:

- **`QL020` (duplicates)** — many Quadlet keys legitimately repeat and accumulate (`Volume=`, `PublishPort=`, `Environment=`, `Label=`, `AddCapability=`, …). Flagging every duplicate would produce constant false positives, so `QL020` fires *only* for keys the docs prove are single-valued. A key of unknown repeatability is never flagged.
- **`QL030` (unknown keys)** — checked only for the Quadlet-specific sections (`[Container]`, `[Pod]`, …), where the man page gives an authoritative key list. The open-ended standard systemd sections (`[Unit]`, `[Service]`, `[Install]`) and `X-` sections are never key-checked. It stays a warning because the key list is a doc snapshot: a key from a newer Podman must never be reported as a hard error.
- **`QL040` (enum values)** — checked only for keys in a hand-curated, source-cited table (`src/enums.ts`) whose value sets are provably closed (e.g. `Pull=`, `ExitPolicy=`, documented booleans — including the `1`/`0` spellings). Keys with open or pattern-shaped value sets (`Notify=`, `AutoUpdate=`) are deliberately omitted, and values containing interpolation (`$`, `%`, backticks, `{{`) or spanning continuation lines are never judged. Omission is always the safe default.
- **`QL050` (section ↔ file type)** — needs an explicit `fileName` option to activate at all; file-name matching is case-sensitive, exactly as Quadlet's own is (a wrongly-cased extension means Quadlet ignores the file, so it must produce no diagnostics). The type-agnostic `[Quadlet]` section, the standard systemd sections, and `X-` sections are never cross-checked, and drop-ins legitimately omit the main section, so only their *mismatched* sections warn.

### Where the key data comes from

The per-section key lists and their repeatability are **extracted from a RedHat copy of the Podman man page** (`References/podman-systemd.unit.5.md`) into a committed data file, [`src/generated/keys.ts`](src/generated/keys.ts). This keeps the runtime dependency-free (no markdown parsing at load) and the data reviewable in git diffs.

The canonical upstream source is:
<https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html>

**The committed data is a snapshot, not a live feed.** It reflects the doc as of the last regeneration and ships frozen in the published package — clients get whatever was current when that version was published, not "the latest". Keeping key data current is a maintenance step: refresh the vendored doc from upstream, regenerate, and publish a new version.

```sh
# 1. refresh References/podman-systemd.unit.5.md from the upstream URL above
npm run gen:keys   # 2. re-extract src/generated/keys.ts
npm test           # 3. sanity-check the regenerated data
# 4. commit + publish a new version
```

This snapshot model is also why the key rules are warnings, not errors (see above): a client on an older snapshot must never hard-fail a file that uses a newer, still-valid Podman key.

## Roadmap

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

MIT. Relicensed from GPL-3.0-or-later per the project roadmap, ahead of the eventual `quadlet-lint-vscode` extension shipping to the VS Code Marketplace.
