import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This test asserts the VS Code extension wires up TextMate syntax
// highlighting: a `contributes.grammars` entry pointing at a grammar file,
// a `language-configuration.json`, and rules within the grammar that
// recognize comments, section headers, and keys.
//
// It intentionally reads raw files (not compiled output) so failures read
// as "the wiring is missing" rather than an unrelated import crash.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vscodeDir = path.resolve(__dirname, "../extensions/vscode");
const manifestPath = path.join(vscodeDir, "package.json");

function readManifest(): any {
  const raw = fs.readFileSync(manifestPath, "utf8");
  return JSON.parse(raw);
}

describe("vscode extension manifest wiring", () => {
  it("declares a contributes.grammars entry for the quadlet language", () => {
    const manifest = readManifest();
    const grammars = manifest?.contributes?.grammars;
    expect(Array.isArray(grammars)).toBe(true);

    const entry = (grammars ?? []).find((g: any) => g?.language === "quadlet");
    expect(entry).toBeDefined();
    expect(entry?.scopeName).toBe("source.quadlet");
    expect(typeof entry?.path).toBe("string");

    const grammarPath = path.resolve(vscodeDir, entry?.path ?? "");
    expect(fs.existsSync(grammarPath)).toBe(true);
  });

  it("points the quadlet language's configuration at an existing language-configuration.json", () => {
    const manifest = readManifest();
    const languages = manifest?.contributes?.languages;
    expect(Array.isArray(languages)).toBe(true);

    const quadletLang = (languages ?? []).find((l: any) => l?.id === "quadlet");
    expect(quadletLang).toBeDefined();
    expect(typeof quadletLang?.configuration).toBe("string");

    const configPath = path.resolve(vscodeDir, quadletLang?.configuration ?? "");
    expect(fs.existsSync(configPath)).toBe(true);
  });
});

describe("quadlet TextMate grammar", () => {
  function loadGrammar(): any {
    const manifest = readManifest();
    const entry = (manifest?.contributes?.grammars ?? []).find(
      (g: any) => g?.language === "quadlet",
    );
    expect(entry, "expected a contributes.grammars entry for quadlet").toBeDefined();

    const grammarPath = path.resolve(vscodeDir, entry?.path ?? "./syntaxes/quadlet.tmLanguage.json");
    expect(
      fs.existsSync(grammarPath),
      `expected grammar file to exist at ${grammarPath}`,
    ).toBe(true);

    const raw = fs.readFileSync(grammarPath, "utf8");
    return JSON.parse(raw);
  }

  // Collects every rule object found in `patterns` (array) and `repository`
  // (object of named rules), without assuming any particular naming scheme.
  function collectRules(grammar: any): any[] {
    const rules: any[] = [];
    if (Array.isArray(grammar?.patterns)) {
      rules.push(...grammar.patterns);
    }
    if (grammar?.repository && typeof grammar.repository === "object") {
      for (const value of Object.values(grammar.repository)) {
        rules.push(value);
      }
    }
    return rules;
  }

  // Compiles a rule's `match` or `begin` regex, if present, into a JS RegExp.
  function ruleRegex(rule: any): RegExp | null {
    const source = rule?.match ?? rule?.begin;
    if (typeof source !== "string") return null;
    try {
      return new RegExp(source);
    } catch {
      return null;
    }
  }

  // Returns true if there exists a SINGLE rule whose regex matches every
  // sample in `positives` and rejects every sample in `negatives`. This is
  // stricter than "some rule matches the positives" OR'd with "some rule
  // rejects the negatives" independently: it requires one rule to be the
  // actual discriminator for the concern being tested.
  function someRuleDiscriminates(
    rules: any[],
    positives: string[],
    negatives: string[],
  ): boolean {
    return rules.some((rule) => {
      const re = ruleRegex(rule);
      if (!re) return false;
      const matchesAllPositives = positives.every((sample) => re.test(sample));
      const rejectsAllNegatives = negatives.every((sample) => !re.test(sample));
      return matchesAllPositives && rejectsAllNegatives;
    });
  }

  // Weaker than `someRuleDiscriminates`: allows a DIFFERENT rule to be the
  // discriminator for each positive sample (useful when a concern is
  // legitimately covered by more than one rule, e.g. separate comment
  // styles), while still requiring that whichever rule matches a given
  // positive also rejects every negative — i.e. no rule that recognizes the
  // sample also misfires on things it shouldn't.
  function eachSampleHasDiscriminatingRule(
    rules: any[],
    positives: string[],
    negatives: string[],
  ): boolean {
    return positives.every((sample) =>
      rules.some((rule) => {
        const re = ruleRegex(rule);
        if (!re) return false;
        if (!re.test(sample)) return false;
        return negatives.every((negative) => !re.test(negative));
      }),
    );
  }

  it("is valid JSON with scopeName 'source.quadlet'", () => {
    const grammar = loadGrammar();
    expect(grammar.scopeName).toBe("source.quadlet");
  });

  it("has, for each comment style, a rule recognizing it but not key=value lines", () => {
    const grammar = loadGrammar();
    const rules = collectRules(grammar);

    expect(
      eachSampleHasDiscriminatingRule(rules, ["# a comment", "; also a comment"], ["Key=value"]),
    ).toBe(true);
  });

  it("has, for each section sample, a rule recognizing it but not keys or comments", () => {
    const grammar = loadGrammar();
    const rules = collectRules(grammar);

    expect(
      eachSampleHasDiscriminatingRule(
        rules,
        ["[Container]", "[X-Custom]"],
        ["Key=value", "# [not a section]"],
      ),
    ).toBe(true);
  });

  it("has, for each key sample, a rule recognizing it but not section headers or comments", () => {
    const grammar = loadGrammar();
    const rules = collectRules(grammar);

    expect(
      eachSampleHasDiscriminatingRule(
        rules,
        ["Image=alpine", 'ExecStart=/bin/sh -c "x"'],
        ["[Container]", "# comment"],
      ),
    ).toBe(true);
  });
});

describe("quadlet language-configuration.json", () => {
  function loadConfig(): any {
    const manifest = readManifest();
    const languages = manifest?.contributes?.languages ?? [];
    const quadletLang = languages.find((l: any) => l?.id === "quadlet");
    expect(quadletLang, "expected a contributes.languages entry for quadlet").toBeDefined();

    const configPath = path.resolve(
      vscodeDir,
      quadletLang?.configuration ?? "./language-configuration.json",
    );
    expect(
      fs.existsSync(configPath),
      `expected language configuration to exist at ${configPath}`,
    ).toBe(true);

    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw);
  }

  it("is valid JSON declaring '#' as the line comment", () => {
    const config = loadConfig();
    expect(config?.comments?.lineComment).toBe("#");
  });

  it("declares a ['[', ']'] bracket pair", () => {
    const config = loadConfig();
    const brackets: unknown[] = config?.brackets ?? [];
    const hasSquareBrackets = brackets.some(
      (pair) => Array.isArray(pair) && pair[0] === "[" && pair[1] === "]",
    );
    expect(hasSquareBrackets).toBe(true);
  });
});
