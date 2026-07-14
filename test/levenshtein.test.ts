import { describe, it, expect } from "vitest";
import { findBestMatch } from "../src/levenshtein.js";

describe("findBestMatch", () => {
  it("finds the closest candidate for a typo", () => {
    expect(findBestMatch("Imge", ["Image", "Exec", "Volume"])).toBe("Image");
  });

  it("compares case-insensitively but returns the candidate's original casing", () => {
    expect(findBestMatch("environment", ["Environment", "EnvironmentFile"])).toBe("Environment");
  });

  it("returns null when the best distance is not strictly less than the word length", () => {
    // "foo" vs "UID": distance 3, word length 3 -> dist < word.length is false.
    expect(findBestMatch("foo", ["UID"])).toBeNull();
  });

  it("returns null when the best distance exceeds the absolute cap of 3", () => {
    expect(findBestMatch("Zzzzzzzz", ["Image", "Exec"])).toBeNull();
  });

  it("returns the candidate itself on an exact match", () => {
    expect(findBestMatch("Image", ["Image"])).toBe("Image");
  });
});
