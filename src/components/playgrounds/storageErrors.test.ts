import { describe, expect, it } from "vitest";
import {
  INVITE_STORAGE_RESTRICTED_LEAD,
  INVITE_STORAGE_RESTRICTED_TITLE,
  isInviteStorageRestrictedError,
  isTransientStorageError,
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

describe("isInviteStorageRestrictedError", () => {
  it("matches explained zh storage messages and OPFS keywords", () => {
    expect(
      isInviteStorageRestrictedError(
        new Error("此開啟方式無法存本機沙盒。請用 Safari 開啟")
      )
    ).toBe(true);
    expect(
      isInviteStorageRestrictedError(new Error("無法寫入本機沙盒儲存（x）"))
    ).toBe(true);
    expect(isInviteStorageRestrictedError(new Error("邀請已過期"))).toBe(
      false
    );
  });
});

describe("invite storage restricted copy", () => {
  it("keeps short user-facing strings", () => {
    expect(INVITE_STORAGE_RESTRICTED_TITLE).toBe("此開啟方式無法存本機沙盒");
    expect(INVITE_STORAGE_RESTRICTED_LEAD).toBe("請用 Safari 開啟");
  });
});
