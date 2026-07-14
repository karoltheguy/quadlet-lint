import { describe, it, expect } from "vitest";
import { getHover, type HoverInfo } from "../src/service.js";

const ADD_HOST_DESCRIPTION = "Add host-to-IP mapping to /etc/hosts. The format is `hostname:ip`.";
const IMAGE_DESCRIPTION =
  "The image to run in the container. It is recommended to use a fully qualified image name rather than a short name, both for performance and robustness reasons.";

describe("getHover", () => {
  it("returns hover info for a known key with a description (start of key)", () => {
    const text = "[Container]\nAddHost=example:1.2.3.4\n";
    const result = getHover(text, { line: 2, column: 1 });
    const expected: HoverInfo = {
      section: "Container",
      key: "AddHost",
      description: ADD_HOST_DESCRIPTION,
    };
    expect(result).toEqual(expected);
  });

  it("returns hover info for a known key with a description (end of key, inclusive)", () => {
    const text = "[Container]\nAddHost=example:1.2.3.4\n";
    const result = getHover(text, { line: 2, column: 8 });
    const expected: HoverInfo = {
      section: "Container",
      key: "AddHost",
      description: ADD_HOST_DESCRIPTION,
    };
    expect(result).toEqual(expected);
  });

  it("returns a null description for a valid key documented only in the 'Valid options' table (Build/Arch)", () => {
    const text = "[Build]\nArch=amd64\n";
    const result = getHover(text, { line: 2, column: 2 });
    const expected: HoverInfo = {
      section: "Build",
      key: "Arch",
      description: null,
    };
    expect(result).toEqual(expected);
  });

  it("returns null when the cursor is inside the value, not the key", () => {
    const text = "[Container]\nAddHost=example:1.2.3.4\n";
    const result = getHover(text, { line: 2, column: 12 });
    expect(result).toBeNull();
  });

  it("returns null for the character just past the inclusive key range (the '=')", () => {
    const text = "[Container]\nAddHost=example:1.2.3.4\n";
    // keyStart=0, key length 7 -> valid inclusive range is [1,8]; column 9 is on "=".
    const result = getHover(text, { line: 2, column: 9 });
    expect(result).toBeNull();
  });

  it("returns null for an assignment before any [Section] header", () => {
    const text = "AddHost=x\n[Container]\n";
    const result = getHover(text, { line: 1, column: 2 });
    expect(result).toBeNull();
  });

  it("returns null for an unknown key", () => {
    const text = "[Container]\nNotARealKey=1\n";
    const result = getHover(text, { line: 2, column: 3 });
    expect(result).toBeNull();
  });

  it("returns null in a standard systemd section with no key data", () => {
    const text = "[Unit]\nDescription=hi\n";
    const result = getHover(text, { line: 2, column: 3 });
    expect(result).toBeNull();
  });

  it("returns hover info for an indented key", () => {
    const text = "[Container]\n  Image=alpine\n";
    // keyStart=2, key length 5 -> valid inclusive range is [3,8].
    const result = getHover(text, { line: 2, column: 3 });
    const expected: HoverInfo = {
      section: "Container",
      key: "Image",
      description: IMAGE_DESCRIPTION,
    };
    expect(result).toEqual(expected);
  });

  it("returns null when hovering a continuation line, and does not treat a section-looking continuation as a new section", () => {
    const text = "[Container]\nExec=foo \\\n[NotASection]=bar\n";
    const result = getHover(text, { line: 3, column: 2 });
    expect(result).toBeNull();
  });

  it("skips a multi-line continuation and still reports the correct enclosing section afterward", () => {
    const text = "[Container]\nAnnotation=a=b \\\nc=d\nImage=alpine\n";
    const result = getHover(text, { line: 4, column: 2 });
    const expected: HoverInfo = {
      section: "Container",
      key: "Image",
      description: IMAGE_DESCRIPTION,
    };
    expect(result).toEqual(expected);
  });

  it("returns null when the cursor is on a section header line", () => {
    const text = "[Container]\n";
    const result = getHover(text, { line: 1, column: 2 });
    expect(result).toBeNull();
  });

  it("returns null when the cursor is beyond the last line, without throwing", () => {
    const text = "[Container]\nAddHost=example:1.2.3.4\n";
    expect(() => getHover(text, { line: 99, column: 1 })).not.toThrow();
    expect(getHover(text, { line: 99, column: 1 })).toBeNull();
  });
});
