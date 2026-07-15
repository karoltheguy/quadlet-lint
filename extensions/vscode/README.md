# quadlet-lint VS Code Extension

Fast, dependency-free linting for Podman [Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) unit files (`.container`, `.pod`, `.network`, `.volume`, `.kube`, `.build`, `.image`, `.artifact`).

## Features

- **Instant Feedback**: Gives instant, as-you-type diagnostics for Podman Quadlet files.
- **Zero False Errors**: Only reports actual failures as errors; uncertain issues are warnings.
- **Support for All Quadlet Types**: Linting for Container, Pod, Network, Volume, Kube, Build, Image, and Artifact files.

## Installation

This extension is built for local development and testing. To package and install it:

1. Package the extension: `npm run build` and `npx @vscode/vsce package` inside the `extensions/vscode` directory.
2. Install the generated `.vsix` file in VS Code.
