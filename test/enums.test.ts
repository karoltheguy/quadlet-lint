import { describe, it, expect } from "vitest";
import { SECTION_ENUMS } from "../src/enums.js";
import { getEnumValues } from "../src/sections.js";
import { SECTION_KEYS } from "../src/generated/keys.js";

describe("SECTION_ENUMS / getEnumValues", () => {
  it("Container Pull has the documented pull-policy values", () => {
    expect(getEnumValues("Container", "Pull")).toEqual(
      new Set(["always", "missing", "never", "newer"]),
    );
  });

  it("Container ReadOnly accepts the 8-value systemd boolean set", () => {
    expect(getEnumValues("Container", "ReadOnly")).toEqual(
      new Set(["true", "false", "yes", "no", "on", "off", "1", "0"]),
    );
  });

  it("Container Image is free-form (no enum)", () => {
    expect(getEnumValues("Container", "Image")).toBeUndefined();
  });

  it("Network Driver has the documented network-driver values", () => {
    expect(getEnumValues("Network", "Driver")).toEqual(
      new Set(["bridge", "macvlan", "ipvlan"]),
    );
  });

  it("Network IPAMDriver has the documented IPAM-driver values", () => {
    expect(getEnumValues("Network", "IPAMDriver")).toEqual(
      new Set(["host-local", "dhcp", "none"]),
    );
  });

  it("boolean keys share the same 8-value systemd boolean set", () => {
    const booleanSet = getEnumValues("Container", "ReadOnly");

    expect(getEnumValues("Container", "ReadOnlyTmpfs")).toEqual(booleanSet);
    expect(getEnumValues("Container", "StartWithPod")).toEqual(booleanSet);
    expect(getEnumValues("Container", "EnvironmentHost")).toEqual(booleanSet);
    expect(getEnumValues("Volume", "Copy")).toEqual(booleanSet);
    expect(getEnumValues("Build", "ForceRM")).toEqual(booleanSet);
    expect(getEnumValues("Build", "TLSVerify")).toEqual(booleanSet);
    expect(getEnumValues("Image", "AllTags")).toEqual(booleanSet);
    expect(getEnumValues("Image", "TLSVerify")).toEqual(booleanSet);
  });

  it("every curated enum key is a documented key for its section (no drift from generated key data)", () => {
    for (const section of Object.keys(SECTION_ENUMS)) {
      const keys = SECTION_ENUMS[section as keyof typeof SECTION_ENUMS];
      for (const key of Object.keys(keys as object)) {
        expect(SECTION_KEYS[section]?.valid.has(key)).toBe(true);
      }
    }
  });
});
