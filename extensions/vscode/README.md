# Quadlet Lint

Catch configuration errors before deployment with real-time Podman [Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) linting, auto-completions, hover docs, and quick-fixes right in your editor.
*The same engine linting in [QuadletManager](https://github.com/karoltheguy/QuadletManager).*

<!--
  SCREENSHOTS: add real VS Code captures here (the web demo's Monaco UI is not
  the same as the VS Code UI, so these must come from VS Code itself). Drop the
  images under extensions/vscode/images/ and reference them with relative paths,
  e.g.:

  ![As-you-type diagnostics](images/diagnostics.png)
  ![Hover documentation](images/hover.png)
  ![Quick fixes](images/quick-fix.png)

  vsce rewrites relative image paths to absolute repository URLs at package time,
  so they render on the Marketplace as long as the files are committed.
-->

## Features

- **Instant diagnostics**: errors and warnings appear as you type.
- **Completions**: key and section suggestions for the unit file you're editing.
- **Hover documentation**: hover a key to see what it does and how it maps to Podman.
- **Quick fixes**: one-click corrections for common mistakes.
- **Syntax highlighting**: a dedicated grammar for Quadlet unit files.
- **Zero false errors**: anything reported as an `error` would genuinely fail systemd/Quadlet; anything uncertain is at most a `warning`.

## Supported files

The extension activates automatically for these file extensions:

`.container` · `.pod` · `.network` · `.volume` · `.kube` · `.build` · `.image` · `.artifact`

Open any supported file and diagnostics start immediately. There is nothing to configure.

## Suppressing a diagnostic

Add a `# quadlet-lint-disable-next-line QLxxx` comment to silence a specific code on the line that follows it (blank lines in between are skipped):

```ini
# quadlet-lint-disable-next-line QL010
[Instal]
```

## Try it online

Want to see it before installing? The linter runs in your browser in the
[**live demo**](https://karoltheguy.github.io/quadlet-lint/), same engine, no install required.

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
| `QL080` | warning   | A **provably-malformed port value** for a port-mapping key (`PublishPort=` in `[Container]`/`[Pod]`/`[Kube]`, `ExposeHostPort=` in `[Container]`): a numeric field greater than `65535`, which no Podman can accept, from a small hand-curated table (`src/ports.ts`). Deliberately narrow — it flags only out-of-range numbers, never structural oddities that a newer Podman might accept. |
| `QL081` | warning   | A **provably-malformed `AddHost=` value** (`[Container]`/`[Pod]`): a value carrying neither `:` nor `=`, so it cannot be the documented `hostname:ip` mapping (the user dropped the IP half). Deliberately narrow — a value with either separator is never flagged, from a small hand-curated table (`src/addhost.ts`). |
| `QL082` | warning   | A **provably-malformed byte-size value** for `Memory=`/`ShmSize=` (`[Container]`/`[Pod]`): a value that isn't a number with an optional go-units suffix (e.g. flags `512mk` or `big`, accepts `512m`/`1.5g`/`512MiB`), from a small hand-curated table (`src/bytesize.ts`). |
| `QL083` | warning   | A **malformed health-check duration** for the `Health*Interval`/`Health*Timeout`/`HealthStartPeriod` keys (`[Container]`): a value that Go's `time.ParseDuration` rejects (e.g. flags the systemd-style `30`, `5min`, or `infinity`, accepts `30s`/`1m30s`/`disable`), from a small hand-curated table (`src/duration.ts`). |
| `QL090` | warning   | Only when the caller supplies a unit index (the CLI does this automatically when scanning a whole directory): a cross-unit reference (`Pod=`, `Network=`, `Volume=` source) points at a unit that isn't among the files being linted, from a small hand-curated reference table. This never claims the referenced unit doesn't exist — it may live elsewhere on the Quadlet search path — so it's always a warning, and it never fires on drop-in `.conf` files or without an index. |

## Feedback

Found a false positive or a missing check? [Open an issue](https://github.com/karoltheguy/quadlet-lint/issues). The zero-false-error goal depends on it.

## License

MIT. See [LICENSE](LICENSE).
