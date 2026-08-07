import { describe, expect, it } from "vitest";
import {
  isTransientStorageError,
  transientStorageHint,
} from "./storageErrors";

describe("isTransientStorageError", () => {
  it("detects Safari／Chrome UnknownError OPFS rejections", () => {
    expect(
      isTransientStorageError(
        new DOMException(
          "The operation failed for an unknown transient reason (e.g. out of memory).",
          "UnknownError"
        )
      )
    ).toBe(true);
    expect(
      isTransientStorageError(new Error("Failed to create swap file."))
    ).toBe(true);
    expect(isTransientStorageError(new Error("network fail"))).toBe(false);
  });
});

describe("transientStorageHint", () => {
  it("mentions Safari／refresh after QR and private mode", () => {
    expect(transientStorageHint()).toMatch(/Safari|掃碼|無痕/);
  });
});
