import { describe, it, expect } from "vitest";
import { runLint } from "../src/cli.js";

describe("runLint (CLI core)", () => {
  it("exits 0 with no output for a clean file", () => {
    const r = runLint("[Container]\nImage=nginx\n", "web.container");
    expect(r.exitCode).toBe(0);
    expect(r.output).toBe("");
  });

  it("exits 1 and reports the code for a file with an error", () => {
    const r = runLint("notaline\n", "web.container");
    expect(r.exitCode).toBe(1);
    expect(r.output.includes("QL001")).toBe(true);
    expect(r.output.includes("web.container:")).toBe(true);
  });

  it("prints warnings but still exits 0 when there is no error", () => {
    const r = runLint("[Instal]\n", "");
    expect(r.exitCode).toBe(0);
    expect(r.output.length > 0).toBe(true);
    expect(r.output.includes("QL010")).toBe(true);
  });

  it("formats each diagnostic as file:line:col: severity code message", () => {
    const r = runLint("notaline\n", "web.container");
    expect(r.output).toMatch(/^web\.container:\d+:\d+: (error|warning) QL\d{3} .+/m);
  });
});
