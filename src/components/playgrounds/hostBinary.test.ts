import { describe, expect, it } from "vitest";
import { HostBridgeError } from "./hostBridge";
import {
  assertBinarySize,
  base64ToBytes,
  bytesToBase64,
  HOST_BINARY_MAX_BYTES,
} from "./hostBinary";

describe("hostBinary", () => {
  it("round-trips base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128]);
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
  });

  it("rejects empty / invalid base64", () => {
    expect(() => base64ToBytes("")).toThrow(HostBridgeError);
    expect(() => base64ToBytes("!!!")).toThrow(HostBridgeError);
  });

  it("enforces size cap", () => {
    expect(() => assertBinarySize(HOST_BINARY_MAX_BYTES + 1, "write")).toThrow(
      HostBridgeError
    );
    expect(() => assertBinarySize(10, "write")).not.toThrow();
  });
});
