# Quadlet Lint for VS Code

[![Version](https://vsmarketplacebadges.dev/version-short/karoltheguy.quadlet-lint-vscode.png?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=karoltheguy.quadlet-lint-vscode)
[![Installs](https://vsmarketplacebadges.dev/installs-short/karoltheguy.quadlet-lint-vscode.png)](https://marketplace.visualstudio.com/items?itemName=karoltheguy.quadlet-lint-vscode)

Fast, dependency-free linting for Podman [Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) unit files, with completions, hover documentation, and quick fixes as you type.

Quadlet files are systemd units, and the authoritative check will always be `podman system generate --dryrun`. But that needs Podman on the host and a round-trip. This extension gives you **instant, in-editor feedback for the mistakes that don't need Podman to detect**, so you catch them before you ever deploy.

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

- **Instant diagnostics**: errors and warnings appear as you type, no save or build step.
- **Completions**: key and section suggestions for the unit file you're editing.
- **Hover documentation**: hover a key to see what it does and how it maps to Podman.
- **Quick fixes**: one-click corrections for common mistakes (the gutter lightbulb).
- **Syntax highlighting**: a dedicated grammar for Quadlet unit files.
- **Zero false errors**: anything reported as an `error` would genuinely fail systemd/Quadlet; anything uncertain is at most a `warning`.

## Supported files

The extension activates automatically for these file extensions:

`.container` · `.pod` · `.network` · `.volume` · `.kube` · `.build` · `.image` · `.artifact`

## Install

Install **Quadlet Lint** from the VS Code Marketplace:

- In VS Code, open the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`), search for **Quadlet Lint**, and click **Install**, or
- Run `code --install-extension karoltheguy.quadlet-lint-vscode` from a terminal.

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

## Feedback

Found a false positive or a missing check? [Open an issue](https://github.com/karoltheguy/quadlet-lint/issues). The zero-false-error goal depends on it.

## License

MIT. See [LICENSE](LICENSE).
