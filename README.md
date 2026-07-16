# quadlet-lint

[![Build and Test](https://github.com/karoltheguy/quadlet-lint/actions/workflows/build.yml/badge.svg)](https://github.com/karoltheguy/quadlet-lint/actions/workflows/build.yml)
[![codecov](https://codecov.io/gh/karoltheguy/quadlet-lint/graph/badge.svg)](https://codecov.io/gh/karoltheguy/quadlet-lint)

Linting for Podman [Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) unit files (`.container`, `.pod`, `.network`, `.volume`, `.kube`, `.build`, `.image`, `.artifact`), with adapters for the [Monaco Editor](https://microsoft.github.io/monaco-editor/) and VS Code.

Quadlet files are systemd units, and the authoritative check will always be `podman system generate --dryrun`. But the generator needs Podman on the host and a round-trip. **quadlet-lint gives instant, as-you-type feedback for only the mistakes that don't need Podman to detect.**

Anything it reports as an `error` would genuinely fail systemd/Quadlet; anything uncertain is at most a `warning`. It is convenience feedback.

> **Status:** not yet published. The commands below (`npm install quadlet-lint`, `npx quadlet-lint`) are how this will be consumed once a first version ships to npm. For now, clone the repo and build locally (see [Development](#development)). The VS Code extension is fully built but unpublished and marked private; install it as a locally-built `.vsix` (see [VS Code usage](#vs-code-usage)).

## Install

```sh
npm install quadlet-lint
```

The core has no runtime dependencies. `monaco-editor` is an **optional peer dependency**, needed only if you import the `quadlet-lint/monaco` adapter.

## Core usage


```ts
import { lintQuadlet } from "quadlet-lint";

const diagnostics = lintQuadlet(text);
// → [{ line, startColumn, endColumn, severity: "error" | "warning", code, message }]

// Pass the file name to also get section ↔ file-type cross-checks (QL050):
const withFileChecks = lintQuadlet(text, { fileName: "web.container" });
```

All positions are **1-based**, matching Monaco: `startColumn` is the first character, `endColumn` is just past the last (exclusive).

### Suppressing a diagnostic

A `# quadlet-lint-disable-next-line QLxxx` comment suppresses that one code on the line immediately following it (blank lines in between are skipped):

```ini
# quadlet-lint-disable-next-line QL010
[Instal]
```

## CLI usage

Lint a file straight from the terminal:

```sh
npx quadlet-lint web.container
# or, once installed: quadlet-lint web.container
```

It prints one line per diagnostic and infers the section ↔ file-type checks (QL050) from the file name:

```
web.container:3:1: error QL050 Missing required [Container] section — Quadlet fails to generate a service without it.
web.container:5:1: warning QL010 Unknown section "[Instal]". This will be ignored — check for a typo or a wrong file type.
```

The **exit code** makes it usable as a gate in CI or a pre-commit hook: it exits **non-zero when any diagnostic is an `error`**, and **`0`** when the file is clean or has only warnings (warnings still print). A missing argument or an unreadable file exits `2`.

```sh
quadlet-lint web.container && echo "ok to ship"
```

## Monaco usage

The Monaco binding is a thin adapter over the core. Pass in your Monaco namespace so the adapter stays agnostic to how Monaco was loaded (bundler, AMD, CDN):

```ts
import * as monaco from "monaco-editor";
import { lintModel } from "quadlet-lint/monaco";

const model = editor.getModel()!;
lintModel(monaco, model);
model.onDidChangeContent(() => lintModel(monaco, model));
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

## VS Code usage

A VS Code extension is in [`extensions/vscode`](extensions/vscode), built on the same service layer as the Monaco adapter: diagnostics, completions, hover documentation, and quick fixes, plus a TextMate grammar and language configuration for `.container`/`.pod`/`.network`/`.volume`/`.kube`/`.build`/`.image`/`.artifact` files.

It isn't published to the Marketplace yet, so package and install it locally:

```sh
npm run package:vscode
# in VS Code: Extensions view → "..." menu → Install from VSIX...
```

## Service layer

`quadlet-lint/service` is the shared, plain-data layer both the Monaco and VS Code adapters are built on. No `monaco` or `vscode` types cross it, which makes it a starting point for adapting quadlet-lint to another editor:

```ts
import { getCompletions, getHover, getQuickFixes } from "quadlet-lint/service";

getCompletions(text, { line, column }, fileName);
getHover(text, { line, column });
getQuickFixes(text, diagnostic);
```

Positions are the same `{ line, column }` used elsewhere.
`TextEdit`/`CompletionItem`/`HoverInfo`/`QuickFix` are plain interfaces exported alongside these functions.

## What it checks

| Code    | Severity  | Rule |
|---------|-----------|------|
| `QL001` | error     | A non-blank, non-comment line that is neither a `[Section]` header nor a `Key=Value` pair (systemd rejects it: *"Missing '=' character"*). |
| `QL002` | error     | An assignment that appears before any `[Section]` header (*"Assignment outside of section"*). |
| `QL010` | warning   | An unknown section (a typo like `[Continer]`, or a section for the wrong file type). `X-` user sections are always allowed. |
| `QL020` | warning   | A duplicate of a key that is **known to be single-valued**, where the last-one-wins behavior is almost certainly a mistake. |
| `QL030` | warning   | A key that is **not documented for its section** (a typo, or an option from a newer Podman than this build knows). Only Quadlet-specific sections are checked. |
| `QL040` | warning   | A value outside the **known closed value set** for its key (e.g. `Pull=sometimes`), from a small hand-curated enum table. Values compare case-insensitively. |
| `QL050` | warning / error | Only when a `fileName` is passed: a file-type-specific section that doesn't match the file's type (warning, since the section is simply ignored), or the expected section missing entirely (error, since Quadlet then fails to generate a service). Drop-in `.conf` files are recognized via their `<type>.d` parent directory and are exempt from the missing-section error. |
| `QL070` | error     | Two keys in the same section that Quadlet's generator refuses to accept together (`Image=`/`Rootfs=` and `ReloadCmd=`/`ReloadSignal=` in `[Container]`), from a small hand-curated conflict table. A key with an empty value doesn't count as set. |
| `QL0X0` | xx | more codes to come.


Diagnostic codes are exported as `Codes` for programmatic use.

### Why key checks are conservative

The key and value rules all lean toward silence, and stay warnings unless the failure is provable. An `error` is reserved for what Quadlet itself demonstrably refuses to generate:

- For **`QL020` (duplicates)**, many Quadlet keys legitimately repeat and accumulate (`Volume=`, `PublishPort=`, `Environment=`, `Label=`, `AddCapability=`, …). Flagging every duplicate would produce constant false positives, so `QL020` fires *only* for keys the docs prove are single-valued. A key of unknown repeatability is never flagged.
- **`QL030` (unknown keys)** is checked only for the Quadlet-specific sections (`[Container]`, `[Pod]`, …), where the man page gives an authoritative key list. The open-ended standard systemd sections (`[Unit]`, `[Service]`, `[Install]`) and `X-` sections are never key-checked. It stays a warning because the key list is a doc snapshot, so a key from a newer Podman must never be reported as a hard error.
- **`QL040` (enum values)** is checked only for keys in a hand-curated, source-cited table (`src/enums.ts`) whose value sets are provably closed (e.g. `Pull=`, `ExitPolicy=`, documented booleans, including the `1`/`0` spellings). Keys with open or pattern-shaped value sets (`Notify=`, `AutoUpdate=`) are deliberately omitted, and values containing interpolation (`$`, `%`, backticks, `{{`) or spanning continuation lines are never judged. Omission is always the safe default.
- **`QL050` (section ↔ file type)** needs an explicit `fileName` option to activate at all, and file-name matching is case-sensitive, exactly as Quadlet's own is (a wrongly-cased extension means Quadlet ignores the file, so it must produce no diagnostics). The type-agnostic `[Quadlet]` section, the standard systemd sections, and `X-` sections are never cross-checked, and drop-ins legitimately omit the main section, so only their *mismatched* sections warn.
- **`QL070` (conflicting keys)** is checked only against a hand-curated, source-cited pair table (`src/conflicts.ts`); omission is the safe default, exactly as with `QL040`. Unlike the rules above, it's one of the few that fires as an `error` rather than a `warning`, justified because Quadlet's generator genuinely returns an error and produces no unit at all when both keys of a pair are set, rather than a doc-snapshot-derived guess about what might be wrong. A key with an empty or whitespace-only value doesn't count as "set", matching the generator's own `len(...) > 0` check, so `Image=` followed by `Rootfs=/path` is correctly left unflagged.

### Where the key data comes from

The per-section key lists and their repeatability are [extracted from the official Podman man page](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) into a committed data file, [`src/generated/keys.ts`](src/generated/keys.ts). 

**The committed data is a snapshot, not a live feed.** It reflects the doc as of the last regeneration and ships frozen in the published package, so clients get whatever was current when that version was published. 

Keeping key data current is a maintenance step: refresh the vendored doc from upstream, regenerate, and publish a new version.

```sh
# 1. refresh References/podman-systemd.unit.5.md from the upstream URL above
npm run gen:keys   # 2. re-extract src/generated/keys.ts
npm test           # 3. sanity-check the regenerated data
# 4. commit + publish a new version
```

## Roadmap

- First publish to npm.
- Publish `quadlet-lint-vscode` to the VS Code Marketplace (the extension itself is already built, as described in [VS Code usage](#vs-code-usage)).

## Non-goals

- Semantic validation stays with `podman system generate --dryrun` and quadlet-lint doesn't try to replace it.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
npm run demo #just to try it out
npm run package:vscode 
```