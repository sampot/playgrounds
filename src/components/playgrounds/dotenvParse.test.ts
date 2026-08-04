import { describe, expect, it } from "vitest";
import {
  ENV_VARS_MAX_BYTES,
  createEnvVarsNamespace,
  parseDotEnv,
  readDotEnvTextFromFiles,
} from "./dotenvParse";

describe("parseDotEnv", () => {
  it("parses keys, quotes, comments, and last-wins", () => {
    const m = parseDotEnv(`
# comment
API_BASE=https://example.com
FEATURE_X=1
EMPTY=
QUOTED="hello world"
SINGLE='x'
DUP=1
DUP=2
HOST=should-skip
vars=skip
bad-name=no
=novalue
`);
    expect(m).toEqual({
      API_BASE: "https://example.com",
      FEATURE_X: "1",
      EMPTY: "",
      QUOTED: "hello world",
      SINGLE: "x",
      DUP: "2",
    });
  });

  it("createEnvVarsNamespace freezes and handles empty/oversize", () => {
    const empty = createEnvVarsNamespace(undefined);
    expect(empty).toEqual({});
    expect(Object.isFrozen(empty)).toBe(true);

    const ok = createEnvVarsNamespace("FOO=bar");
    expect(ok.FOO).toBe("bar");
    expect(() => {
      (ok as { FOO: string }).FOO = "x";
    }).toThrow();

    const huge = "A=" + "x".repeat(ENV_VARS_MAX_BYTES);
    expect(createEnvVarsNamespace(huge)).toEqual({});
  });

  it("readDotEnvTextFromFiles only accepts text .env", () => {
    expect(readDotEnvTextFromFiles({ ".env": "A=1" })).toBe("A=1");
    expect(readDotEnvTextFromFiles({ ".env": { binary: true } as never })).toBe(
      undefined
    );
    expect(readDotEnvTextFromFiles({})).toBeUndefined();
  });
});
