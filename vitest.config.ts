import { defineConfig, coverageConfigDefaults } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      // `scripts/` holds build-time generators (see scripts/extract-keys.mjs).
      // They never ship: tsup builds only src/* and package.json `files` is
      // ["dist", "bin"]. Unit tests import their pure helpers, which would
      // otherwise drag the whole generator into the coverage denominator.
      exclude: [...coverageConfigDefaults.exclude, "scripts/**"],
    },
  },
});
