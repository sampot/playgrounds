import { describe, expect, it } from "vitest";
import {
  SESSION_MESH_TYPE,
  buildSessionMeshMessage,
  isSessionMeshMessage,
  shouldOfferMesh,
} from "./rosterSessionMesh";

describe("session_mesh", () => {
  it("accepts hello that introduces one peer", () => {
    const hello = buildSessionMeshMessage({ op: "hello", peerId: "g-a" });
    expect(hello).toEqual({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-a",
    });
    expect(isSessionMeshMessage(hello)).toBe(true);
  });

  it("accepts bye that removes a peer", () => {
    expect(
      isSessionMeshMessage(
        buildSessionMeshMessage({ op: "bye", peerId: "g-a" })
      )
    ).toBe(true);
  });

  it("accepts offer／answer／fail with from and to", () => {
    const offer = buildSessionMeshMessage({
      op: "offer",
      from: "g-a",
      to: "g-b",
      sdp: "wire-offer",
    });
    expect(isSessionMeshMessage(offer)).toBe(true);
    expect(offer).toMatchObject({ op: "offer", from: "g-a", to: "g-b" });
    expect(
      isSessionMeshMessage(
        buildSessionMeshMessage({
          op: "fail",
          from: "g-a",
          to: "g-b",
        })
      )
    ).toBe(true);
  });

  it("rejects chat, missing routing, or empty sdp", () => {
    expect(isSessionMeshMessage({ type: "session_chat" })).toBe(false);
    expect(
      isSessionMeshMessage({
        type: SESSION_MESH_TYPE,
        v: 1,
        op: "hello",
      })
    ).toBe(false);
    expect(
      isSessionMeshMessage({
        type: SESSION_MESH_TYPE,
        v: 1,
        op: "offer",
        from: "a",
        to: "b",
      })
    ).toBe(false);
  });

  it("lets the lexicographically smaller agentId offer to avoid glare", () => {
    expect(shouldOfferMesh("g-a", "g-b")).toBe(true);
    expect(shouldOfferMesh("g-b", "g-a")).toBe(false);
    expect(shouldOfferMesh("same", "same")).toBe(false);
  });
});
