import { describe, it, expect } from "vitest";
import { SECTION_KEYS } from "../src/generated/keys.js";

// Guards against a broken regeneration of src/generated/keys.ts. These assert
// stable, load-bearing facts from the Podman doc — not the full key lists.
describe("generated key data", () => {
  it("covers the nine Quadlet sections", () => {
    expect(Object.keys(SECTION_KEYS).sort()).toEqual(
      ["Artifact", "Build", "Container", "Image", "Kube", "Network", "Pod", "Quadlet", "Volume"],
    );
  });

  it("has a plausible number of Container keys", () => {
    expect(SECTION_KEYS.Container!.valid.size).toBeGreaterThan(50);
  });

  it("classifies well-known Container keys correctly", () => {
    const { valid, singleValue } = SECTION_KEYS.Container!;
    // Valid keys.
    for (const k of ["Image", "PublishPort", "Environment", "Volume", "Entrypoint"]) {
      expect(valid.has(k), `Container should accept ${k}`).toBe(true);
    }
    // Single-valued.
    for (const k of ["Image", "ContainerName"]) {
      expect(singleValue.has(k), `${k} should be single-valued`).toBe(true);
    }
    // Repeatable -> NOT single-valued.
    for (const k of ["PublishPort", "Environment", "Volume", "Label"]) {
      expect(singleValue.has(k), `${k} must not be single-valued`).toBe(false);
    }
  });

  it("uses the documented casing (Entrypoint, not EntryPoint)", () => {
    expect(SECTION_KEYS.Container!.valid.has("Entrypoint")).toBe(true);
    expect(SECTION_KEYS.Container!.valid.has("EntryPoint")).toBe(false);
  });

  it("singleValue is always a subset of valid", () => {
    for (const [section, { valid, singleValue }] of Object.entries(SECTION_KEYS)) {
      for (const k of singleValue) {
        expect(valid.has(k), `${section}.${k} single but not valid`).toBe(true);
      }
    }
  });
});

describe("descriptions", () => {
  it("every section has a descriptions object", () => {
    for (const [section, entry] of Object.entries(SECTION_KEYS)) {
      const descriptions = entry.descriptions;
      expect(descriptions, `${section}.descriptions should exist`).toBeTypeOf("object");
    }
  });

  it("Container.descriptions.Image is a non-empty string", () => {
    const descriptions = SECTION_KEYS.Container!.descriptions;
    expect(typeof descriptions["Image"]).toBe("string");
    expect(descriptions["Image"]!.length).toBeGreaterThan(0);
  });

  it("Container.descriptions.Rootfs is a non-empty string", () => {
    const descriptions = SECTION_KEYS.Container!.descriptions;
    expect(typeof descriptions["Rootfs"]).toBe("string");
    expect(descriptions["Rootfs"]!.length).toBeGreaterThan(0);
  });

  it("every description key is a member of the section's valid set", () => {
    for (const [section, entry] of Object.entries(SECTION_KEYS)) {
      const { valid, descriptions } = entry;
      for (const k of Object.keys(descriptions)) {
        expect(valid.has(k), `${section}.descriptions.${k} not in valid`).toBe(true);
      }
    }
  });

  it("descriptions are single paragraphs, not blank", () => {
    for (const [section, entry] of Object.entries(SECTION_KEYS)) {
      const { descriptions } = entry;
      for (const [k, desc] of Object.entries(descriptions)) {
        expect(desc.includes("\n\n"), `${section}.descriptions.${k} contains a blank line`).toBe(false);
        expect(desc.trim().length, `${section}.descriptions.${k} is blank`).toBeGreaterThan(0);
      }
    }
  });
});
