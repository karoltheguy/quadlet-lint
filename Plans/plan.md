# quadlet-lint: depth + VS Code-ready service layer

## Context

`quadlet-lint` is a pure, dependency-free linter for Podman Quadlet unit files
(`src/index.ts`) with a thin Monaco adapter (`src/monaco.ts`), backed by
per-section key data (`src/generated/keys.ts`) extracted from a vendored Podman
man page (`scripts/extract-keys.mjs`). Its north-star constraint is **zero false
errors**: anything reported `error` must genuinely fail systemd/Quadlet;
anything uncertain is at most a `warning`.

Two goals drive this work: (1) **depth** — add doc/semantics-backed value and
structure checks the current line-shape rules lack; (2) **reach** — a
`quadlet-lint-vscode` extension is planned, so the richer interactive features
(completions, hover, quick-fixes) must live in an editor-neutral layer, not get
Monaco-locked. Decisions already taken: build the service layer now, relicense
to MIT, and make QL040 (value validation) the first feature milestone.

### Finding that revises the draft (read before implementing M1)

I verified against `References/podman-systemd.unit.5.md` that **enum value sets
cannot be safely auto-extracted from the doc**, contrary to the draft:

- Most enum keys defer to Podman: `Pull=`, `CgroupsMode=`, `LogDriver=`,
  `Policy=`, `HealthOnFailure=`, `ImageVolume=` all say *"equivalent to the
  Podman `--x` option"* and list no values. `Pull=`'s values
  (`always/missing/never/newer`) are **not in the doc at all**.
- Only three `"following values are supported:"` blocks exist (2× `AutoUpdate`,
  1× `ExitCodePropagation`); `AutoUpdate`'s list includes a non-literal pattern
  value `name/(local|registry)`, so its set isn't closed.
- The `(defaults to \`false\`)` boolean signal is unsafe: `Notify=` carries it
  but also accepts `healthy` — a boolean rule would falsely flag valid
  `Notify=healthy`. (The draft's `Notify=conmon/healthy/...` example is itself
  not doc-backed.)

`singleValue` extraction is safe because it only ever *omits*; an enum set is an
*inclusion* claim that can be wrong. **Therefore QL040 is backed by a small,
hand-curated, source-cited enum table (`src/enums.ts`), not the extractor.** The
extractor is still extended in M3 for **descriptions** (hover), which *are*
cleanly doc-extractable. If you prefer doc-only auto-extraction, say so at
approval — coverage would shrink to ~`ExitCodePropagation` and QL040 could not
flag `Pull=`.

## Architecture: editor-agnostic language-service layer

```
                 text (+ fileName?)                text + position
                       │                                  │
                       ▼                                  ▼
        ┌──────────────────────────┐         ┌───────────────────────────┐
        │ src/index.ts             │         │ src/service.ts (NEW)      │
        │ lintQuadlet(text, opts?) │◄────────│ re-exports lintQuadlet    │
        │  → Diagnostic[]          │  reuse  │ getCompletions/getHover/  │
        └──────────────────────────┘         │ getQuickFixes → plain data│
                 │  reads                     └───────────────────────────┘
                 ▼                                  │ plain data (no editor types)
   ┌─────────────────────────────┐        ┌─────────┴───────────┐
   │ src/sections.ts             │        ▼                     ▼
   │ getEnumValues / expected-   │  ┌──────────────┐   ┌────────────────────┐
   │ SectionFor(fileName)        │  │ src/monaco.ts│   │ (future) vscode.ts │
   └─────────────────────────────┘  │ providers +  │   │ thin adapter over  │
        │ reads           │ reads   │ toMarker(s)  │   │ the SAME service   │
        ▼                 ▼         └──────┬───────┘   └────────────────────┘
  generated/keys.ts   src/enums.ts (NEW)  │ maps plain data → monaco.*
  (valid/singleValue/  curated enum sets  ▼
   descriptions)                     src/adapters/shared.ts (optional)
```

**Position boundary:** `Diagnostic` uses 1-based `line`/`startColumn`/`endColumn`
(`src/index.ts:28`). `service.ts` introduces a local `Position { line: number;
column: number }` (1-based) and `TextEdit`/`CompletionItem`/`HoverInfo`/
`QuickFix` types. **No `monaco`/`vscode` type may cross `service.ts`.** Enforced
by `npm run typecheck` (service.ts imports only from `./index`, `./sections`,
`./generated/keys`, `./enums`).

## Shared prerequisite — filename threading

- `src/index.ts`: change signature to
  `lintQuadlet(text: string, options?: { fileName?: string }): Diagnostic[]`.
  Keep the 1-arg call working (options optional). No existing test/caller passes
  a second arg, so this is back-compatible.
- `src/sections.ts`: add an extension→section table and
  `expectedSectionFor(fileName: string): string | null`:
  `.container→Container, .pod→Pod, .network→Network, .volume→Volume,
  .kube→Kube, .build→Build, .image→Image` (`.artifact→Artifact` too, matching
  the generated sections).
- `service.ts` threads `fileName` through to `lintQuadlet` and completions.

## Milestone 1 — QL040 enum / value-format validation (curated table)

- **`src/enums.ts` (NEW):** `export const SECTION_ENUMS: Readonly<Record<string,
  Readonly<Record<string, ReadonlySet<string>>>>>` keyed `section → key → set`.
  Seed conservatively, each entry with a `// source:` comment citing the Podman
  option/doc line: e.g. `Container.Pull` = always/missing/never/newer;
  `Container.ImageVolume` = bind/tmpfs/ignore; `Container.NoNewPrivileges`/
  `ReadOnly`/`RunInit` and `Network.Internal`/`DisableDNS`/`IPv6`/
  `NetworkDeleteOnStop` = the boolean set {true,false,yes,no,on,off} —
  **excluding** keys like `Notify` that carry extra literals. `Pod.ExitPolicy`
  = continue/stop; `Kube.ExitCodePropagation` = all/any/none. Add
  `AutoUpdate` only if expressible as a closed literal set — it is not (pattern
  values), so **omit it**. Keep the table small and certain; omission is always
  the safe default.
- **`src/sections.ts`:** add `getEnumValues(section, key): ReadonlySet<string> |
  undefined` reading `SECTION_ENUMS` (mirrors `isSingleValueKey`).
- **`src/index.ts`:** add `Codes.ENUM_VALUE = "QL040"`. After the existing
  unknown-key check, if `getEnumValues(currentSection, key)` is defined, parse
  the value (`raw.slice(eq+1).trim()`, single-line only — skip when the line is
  a continuation start), and if the value ∉ set, emit a **warning** flagging the
  **value range** (compute value start/end columns from `eq`).
  - **Case-insensitive match:** store all enum sets lowercased; compare
    `value.toLowerCase()`. systemd booleans are case-insensitive (`True`,
    `YES`, `on`); lowercasing only ever *suppresses* a warning, never creates
    one, so it upholds zero-false-positives even for non-boolean enums.
  - **Interpolation/specifier bypass:** skip when the value is empty or contains
    `$`, a backtick, `%` (systemd specifier), or `{{` — e.g. `Pull=${POLICY}`,
    `ReadOnly=%i`. Only listed keys are ever checked, so this is doubly
    conservative.
- **Tests (`test/lint.test.ts`):** good `Pull=always` → no QL040; bad
  `Pull=sometimes` → one QL040 warning on the value range; a free-form key
  (`Image=…`, `Environment=…`) never QL040; `Notify=healthy` never flagged
  (guards the boolean-landmine). Add a small `test/enums.test.ts` asserting a
  couple of known sets and that every enum key is `valid` for its section (cross-
  check against `SECTION_KEYS`).

## Milestone 2 — QL050 section ↔ file-type mismatch

- `src/sections.ts` — `expectedSectionFor(fileName)` handles **drop-ins**
  (doc line 80: `foo.container.d/*.conf`, top-level `container.d/`,
  dash-truncated `foo-.container.d/`, template `foo@.container.d/`). Normalize
  slashes + lowercase; if the path ends in `.conf`, resolve the section from a
  `.d` path **segment** (match `(^|/)[^/]*\.?<type>\.d/` for each type, so all
  drop-in name shapes are covered) and return a `{ section, isDropin: true }`
  signal; otherwise map the direct extension. Returns `null` for a bare `.conf`
  not under a `.d` dir (no QL050 at all — conservative).
- `src/index.ts`: `Codes.SECTION_FILE_MISMATCH = "QL050"`. Only active when
  `options.fileName` resolves to an expected section (silent otherwise):
  - a **file-specific** Quadlet section present that is a *different* file
    section than expected (e.g. `[Volume]` in a `.container`) → **warning**.
    **Exempt** `[Quadlet]` (doc line 2875 — shared across unit types) and the
    standard `[Unit]`/`[Service]`/`[Install]` (never in `QUADLET_SECTIONS`).
    Check against the file-specific set = `QUADLET_SECTIONS \ {Quadlet}`.
  - expected section entirely **absent** → **error** — but **only for
    non-drop-in files**. Drop-ins legitimately omit the main section, so skip
    the absent-section error when `isDropin` is true (still warn on a foreign
    file-specific section). Track "saw expected section" in the section loop;
    emit after the loop with a line-1 range.
- Tests: `.container` with `[Volume]` and no `[Container]` → QL050 warning +
  QL050 error; a `foo.container.d/10.conf` drop-in with only `[Service]` → no
  QL050 error; same drop-in with `[Volume]` → QL050 warning only; `[Quadlet]`
  in a `.container` → no QL050; no `fileName` → none; correct file → clean.

## Milestone 3 — Editor UX via the service layer

- **Extractor (`scripts/extract-keys.mjs`):** extend the existing per-key detail
  loop (`DETAIL_KEY`/`flush`, lines 82–100) to also capture the first non-empty
  prose paragraph after each key header as a short blurb. Emit a third
  per-section field `descriptions: Readonly<Record<string,string>>`; update the
  `SectionKeys` interface + emit template (lines 106–131) and the console
  summary. Re-run `npm run gen:keys`; commit regenerated `keys.ts`.
- **`src/service.ts` (NEW):**
  - `getCompletions(text, position, fileName?)`: section-header completions at
    line start / inside `[`; section-aware key completions from
    `SECTION_KEYS[section].valid`; enum-value completions from
    `getEnumValues` when the cursor is after `Key=`.
  - `getHover(text, position)`: resolve the key under the cursor (target line
    `lines[position.line-1]`; verify `position.column` ∈ `[keyStart+1,
    keyStart+key.length+1]`, matching `src/index.ts:172-173`; scan backward via
    `SECTION_RE` for the enclosing section). Return `{ section, key, description
    }`. **`description` is `null` when the key has no detailed block** (keys that
    exist only in the "Valid options" table aren't in `descriptions`) — hover
    still shows section+key. Return `null` when the cursor isn't on a key or is
    before any section.
  - `getQuickFixes(text, diagnostic)`: for QL030, nearest known key via
    `src/levenshtein.ts` — `findBestMatch` with guards `dist <= 3 && dist <
    word.length` to reject unrelated short keys (`foo`↛`UID`). **Compare
    case-insensitively (lowercase both sides) but return the candidate's
    original casing**, so `environment`→`Environment` still resolves. Also reused
    to enrich the QL030 message with *"did you mean X?"*. Returns `{ title, edits:
    TextEdit[] }` with 1-based positions matching `Diagnostic`.
- **`src/monaco.ts`:** add wrappers registering `CompletionItemProvider` /
  `HoverProvider` / `CodeActionProvider` that translate service plain-data into
  monaco types, mirroring `toMarker`. Optional `src/adapters/shared.ts` for
  severity/position mapping reused by the future vscode adapter.
- **`demo/main.ts`:** seed a `Pull=sometimes` line (QL040) and wire the three
  providers so they're exercised.
- **Packaging:** add `"./service"` to `package.json` `exports` and a `service`
  entry in `tsup.config.ts`.

## Milestone 4 — Reach & robustness (independent)

- **CLI** `bin/quadlet-lint.mjs`: read file, infer `fileName`, print
  diagnostics, exit non-zero on any `error`. Add `bin` to `package.json`.
- **Suppression** `# quadlet-lint-disable-next-line QLxxx`: in `lintQuadlet`,
  track disable comments and drop matching diagnostics on the next code line.
- **MIT relicense** (do up front): `LICENSE`, `package.json` `"license":"MIT"`,
  README license section/roadmap note.
- **`quadlet-lint-vscode`**: thin adapter over `src/service.ts` + diagnostic
  collection; `vsce` packaging; activation on Quadlet extensions. No core change
  expected — this is the payoff of the service boundary.

## Delegation split (Opus designs, Sonnet executes)

- **Opus:** `service.ts` boundary/types, `fileName` options API, the curated
  `src/enums.ts` contents + QL040 severity/range logic, QL050 error-vs-warning
  call, quick-fix data shape.
- **Sonnet:** extractor description-capture regex/emit, all golden/unit tests,
  the extension→section table, Levenshtein helper, Monaco provider wiring, demo
  updates, CLI + suppression plumbing, MIT relicense edits.

## Verification

- `npm run gen:keys` — regenerates `keys.ts` with the new `descriptions` field
  and sane blurbs; console summary unchanged in structure.
- `npm test` — new QL040/QL050/enum cases pass; **existing zero-false-error
  cases still pass**, incl. `Notify=healthy` and free-form keys never flagged.
- `npm run typecheck` — passes; `service.ts` exposes no `monaco`/`vscode` types.
- `npm run demo` — a bad `Pull=` value underlines (QL040); completions offer
  section keys + enum values; hover shows a key blurb; the QL030 quick-fix
  rewrites a typo'd key; opening the sample under a mismatched extension fires
  QL050.
- Authoritative cross-check (if Podman available): run
  `/usr/lib/podman/quadlet --dryrun` on the sample to confirm QL050 errors
  correspond to real generator failures and no valid file is flagged `error`.
