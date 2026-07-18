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

// Pass the file name to also get the file-name-gated checks (QL050 section
// cross-checks, plus QL060/QL061 required and conditional keys):
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

Lint files or whole directories straight from the terminal:

```sh
npx quadlet-lint web.container
# or, once installed: quadlet-lint web.container

# several paths at once, and directories to scan:
quadlet-lint web.container db.volume
quadlet-lint /etc/containers/systemd
```

It prints one line per diagnostic and infers the file-name-gated checks (QL050, QL060, QL061) from each file's own path:

```
web.container:3:1: error QL050 Missing required [Container] section — Quadlet fails to generate a service without it.
web.container:5:1: warning QL010 Unknown section "[Instal]". This will be ignored — check for a typo or a wrong file type.
```

A **directory** argument is scanned recursively, and only files Quadlet itself would recognize are linted: the known extensions, plus `.conf` drop-ins under a `<type>.d` directory. Everything else in the tree is skipped, symlinked directories are not followed, and results are reported in a stable, sorted order. A file named **explicitly** on the command line is always linted, even if its name isn't Quadlet-shaped, so `quadlet-lint ./some-unit` still works.

Pass **`--format json`** (or `-f json`) for machine-readable output instead of the default text. It prints a single flat array of every diagnostic across all files, each entry tagged with its `file`, so it pipes straight into `jq`:

```sh
quadlet-lint --format json /etc/containers/systemd | jq '.[] | select(.severity == "error")'
```

```json
[
  {
    "file": "web.container",
    "line": 3,
    "startColumn": 1,
    "endColumn": 1,
    "severity": "error",
    "code": "QL050",
    "message": "Missing required [Container] section — Quadlet fails to generate a service without it."
  }
]
```

A clean run prints `[]` rather than nothing, so a consumer can parse stdout unconditionally. In text output, the severity is colorized on a terminal; color is suppressed when the output is piped or when [`NO_COLOR`](https://no-color.org) is set.

The **exit code** makes it usable as a gate in CI or a pre-commit hook: it exits **non-zero when any diagnostic is an `error`**, and **`0`** when everything is clean or has only warnings (warnings still print). A missing argument, an unknown `--format` value, or any path that can't be read (including a directory that can't be listed), exits `2`; unreadable paths are named on stderr and don't stop the remaining files from being linted.

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

Beyond markers, the adapter can register language providers for completions (sections, keys, and enum values), hover documentation, and quick fixes (rewriting a typo'd section, key, or enum value, and correcting or inserting the section a file's type expects). Providers register per language ID, so give your model a language (the built-in `ini` works well for unit files):

```ts
import { registerCompletionProvider, registerHoverProvider, registerCodeActionProvider } from "quadlet-lint/monaco";

registerCompletionProvider(monaco, "ini");
registerHoverProvider(monaco, "ini");
registerCodeActionProvider(monaco, "ini");
```

Completions are file-type aware when the model's URI has a Quadlet extension (e.g. `web.container` won't suggest `[Pod]`).

Key completions and hover also cover the standard systemd sections (`[Unit]`, `[Service]`, `[Install]`) with the directives from their man pages, the most common ones with hover documentation. This is editor convenience only: keys in those sections are never validated, so an uncommon systemd directive is still accepted silently.

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
getQuickFixes(text, diagnostic, fileName);
```

Positions are the same `{ line, column }` used elsewhere. `getQuickFixes`'s `fileName` is optional and only gates the QL050 fixes (correcting or inserting the file type's expected section), which need to know the file's type; without it those fixes simply aren't offered.
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
| `QL060` | error     | Only when a `fileName` is passed and the file is not a drop-in: a required key, or required one-of group, is missing from the file's own expected section (e.g. `[Kube]` with no `Yaml=`, or `[Container]` with neither `Image=` nor `Rootfs=`), from a small hand-curated required-key table. |
| `QL061` | error     | Only when a `fileName` is passed and the file is not a drop-in: a conditional requirement is unmet (e.g. `[Volume]` with `Driver=image` but no `Image=`, or `[Network]` with `Gateway=`/`IPRange=` but no `Subnet=`), from a small hand-curated conditional table. |
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
- **`QL060` and `QL061` (required keys)** are checked only against a hand-curated, source-cited table (`src/required.ts`); omission is the safe default, exactly as with `QL040` and `QL070`. Both fire as `error`, justified the same way as `QL070`: Quadlet's generator genuinely returns an error and produces no unit at all when a required key or conditional requirement is unmet, rather than a doc-snapshot-derived guess. Both need an explicit `fileName` option to activate, and never fire on drop-in `.conf` files, which legitimately override only some keys of their main section. Emptiness is judged per check to match the generator exactly: `[Container]`'s `Image=`/`Rootfs=` and `[Build]`'s `ImageTag=` must be non-empty to count, while `[Volume]`'s `Image=` (required only when `Driver=image`, compared case-sensitively) counts by presence alone, an empty `Image=` still satisfies it, because that's what the generator itself checks.

### Where the key data comes from

The per-section key lists and their repeatability are [extracted from the official Podman man page](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) into a committed data file, [`src/generated/keys.ts`](src/generated/keys.ts). 

**The committed data is a snapshot, not a live feed.** It reflects the doc as of the last regeneration and ships frozen in the published package, so clients get whatever was current when that version was published. 

Keeping key data current is a maintenance step: regenerate against upstream, sanity-check, and publish a new version. The generator ([`scripts/extract-keys.mjs`](scripts/extract-keys.mjs)) fetches the man page live from the upstream URL above, so there is no vendored copy to refresh first.

```sh
npm run gen:keys   # 1. re-extract src/generated/keys.ts (fetches upstream live)
npm test           # 2. sanity-check the regenerated data
# 3. commit + publish a new version
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