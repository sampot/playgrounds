import { describe, expect, it } from "vitest";
import {
  SESSION_RECORD_TYPE,
  buildSessionRecordMessage,
  isSessionRecordMessage,
} from "./rosterSessionRecord";

describe("session_record", () => {
  it("accepts start, stop, notify, done, and error", () => {
    expect(
      isSessionRecordMessage(
        buildSessionRecordMessage({
          op: "start",
          from: "host-1",
          targetPeer: "g-a",
          label: "臥室",
        })
      )
    ).toBe(true);
    expect(
      isSessionRecordMessage(
        buildSessionRecordMessage({
          op: "stop",
          from: "host-1",
          targetPeer: "g-a",
        })
      )
    ).toBe(true);
    expect(
      isSessionRecordMessage(
        buildSessionRecordMessage({
          op: "notify",
          from: "host-1",
          targetPeer: "g-a",
          active: true,
        })
      )
    ).toBe(true);
    expect(
      isSessionRecordMessage(
        buildSessionRecordMessage({
          op: "done",
          from: "host-1",
          targetPeer: "g-a",
          privateId: "pvt_abc123",
          name: "小明-20260823-101530.webm",
          mime: "video/webm",
          size: 4096,
          duration: 12.5,
        })
      )
    ).toBe(true);
    expect(
      isSessionRecordMessage(
        buildSessionRecordMessage({
          op: "error",
          from: "host-1",
          targetPeer: "g-a",
          code: "peer_not_live",
          reason: "對方沒有開鏡頭",
        })
      )
    ).toBe(true);
  });

  it("rejects missing targetPeer on start", () => {
    expect(
      isSessionRecordMessage({
        type: SESSION_RECORD_TYPE,
        v: 1,
        op: "start",
        from: "host-1",
      })
    ).toBe(false);
  });

  it("rejects notify without active flag", () => {
    expect(
      isSessionRecordMessage({
        type: SESSION_RECORD_TYPE,
        v: 1,
        op: "notify",
        from: "host-1",
        targetPeer: "g-a",
      })
    ).toBe(false);
  });

  it("rejects unknown error codes", () => {
    expect(
      isSessionRecordMessage({
        type: SESSION_RECORD_TYPE,
        v: 1,
        op: "error",
        from: "host-1",
        targetPeer: "g-a",
        code: "cloud_fail",
      })
    ).toBe(false);
  });
});
