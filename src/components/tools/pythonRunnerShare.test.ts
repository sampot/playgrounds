import { describe, expect, it } from "vitest";
import {
  DEFAULT_PYTHON_CODE,
  buildToolShareUrl,
  decodeShareFromLocation,
  decodeShareHash,
  encodeShareHash,
  formatPackageList,
  parsePackageList,
} from "./pythonRunnerShare";

describe("parsePackageList", () => {
  it("splits commas, whitespace, and Chinese separators", () => {
    expect(parsePackageList("numpy, pandas；requests")).toEqual([
      "numpy",
      "pandas",
      "requests",
    ]);
  });

  it("dedupes and drops empties", () => {
    expect(parsePackageList("  numpy ,, numpy ,  ")).toEqual(["numpy"]);
  });
});

describe("formatPackageList", () => {
  it("joins with comma+space", () => {
    expect(formatPackageList(["a", "b"])).toBe("a, b");
  });
});

describe("share encode/decode", () => {
  it("round-trips code and packages via #s=", () => {
    const state = {
      code: 'print("hi")\n',
      packages: ["numpy"],
    };
    const hash = encodeShareHash(state);
    expect(hash.startsWith("#s=")).toBe(true);
    expect(decodeShareHash(hash)).toEqual(state);
  });

  it("omits empty packages from payload but still decodes", () => {
    const hash = encodeShareHash({ code: "x = 1", packages: [] });
    expect(decodeShareHash(hash)).toEqual({ code: "x = 1", packages: [] });
  });

  it("decodes simple #code= form", () => {
    expect(decodeShareHash("#code=print(1)&packages=micropip")).toEqual({
      code: "print(1)",
      packages: ["micropip"],
    });
  });

  it("prefers hash over query in decodeShareFromLocation", () => {
    const hash = encodeShareHash({ code: "from-hash", packages: [] });
    expect(decodeShareFromLocation("?code=from-query", hash)).toEqual({
      code: "from-hash",
      packages: [],
    });
  });

  it("falls back to ?code= when hash empty", () => {
    expect(decodeShareFromLocation("?code=hello&packages=numpy", "")).toEqual({
      code: "hello",
      packages: ["numpy"],
    });
  });

  it("rejects invalid #s= payload", () => {
    expect(decodeShareHash("#s=%%%")).toBeNull();
  });

  it("builds absolute share URL", () => {
    const url = buildToolShareUrl("https://samkuo.me", "/tools/python-runner", {
      code: "print(1)",
      packages: [],
    });
    expect(url.startsWith("https://samkuo.me/tools/python-runner/#s=")).toBe(
      true
    );
    const hash = url.slice(url.indexOf("#"));
    expect(decodeShareHash(hash)?.code).toBe("print(1)");
  });

  it("default sample code is non-empty", () => {
    expect(DEFAULT_PYTHON_CODE.includes("print")).toBe(true);
  });
});
