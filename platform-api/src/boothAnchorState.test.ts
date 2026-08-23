import { describe, expect, it } from "vitest";
import {
  BOOTH_ENGINE_GRACE_MS,
  applyEnginePresence,
  cacheEngineSnapshot,
  clearEngineSocket,
  createEmptyAnchorRecord,
  ensureAnchorRecord,
  enginePresence,
  markEngineSocket,
  canMintOperatorCap,
  publicAnchorStatus,
  registerAnchorSession,
  revokeAnchor,
  verifyAnchorSecretHash,
} from "./boothAnchorState.js";

describe("boothAnchorState", () => {
  it("registers a new session", () => {
    const rec = createEmptyAnchorRecord("u1");
    const out = registerAnchorSession({
      rec,
      boothSessionId: "sess-a",
      anchorSecretHash: "hash-a",
      deviceLabel: "home",
      now: 1000,
    });
    expect(out).toEqual({ ok: true, replaced: false });
    expect(rec.boothSessionId).toBe("sess-a");
    expect(verifyAnchorSecretHash(rec, "hash-a")).toBe(true);
  });

  it("rejects second session without force", () => {
    const rec = createEmptyAnchorRecord("u1");
    registerAnchorSession({
      rec,
      boothSessionId: "sess-a",
      anchorSecretHash: "hash-a",
      now: 1000,
    });
    markEngineSocket(rec, "ws-1", 1000);
    const out = registerAnchorSession({
      rec,
      boothSessionId: "sess-b",
      anchorSecretHash: "hash-b",
      now: 2000,
    });
    expect(out).toEqual({ ok: false, status: 409, error: "anchor_session_active" });
  });

  it("ensureAnchorRecord preserves existing session", () => {
    const rec = createEmptyAnchorRecord("u1");
    registerAnchorSession({
      rec,
      boothSessionId: "sess-a",
      anchorSecretHash: "hash-a",
      now: 1000,
    });
    markEngineSocket(rec, "ws-1", 1000);
    const kept = ensureAnchorRecord(rec, "u1");
    expect(kept).toBe(rec);
    expect(kept.boothSessionId).toBe("sess-a");
    expect(kept.engineSocketId).toBe("ws-1");
  });

  it("ensureAnchorRecord creates when missing", () => {
    const rec = ensureAnchorRecord(null, "u1");
    expect(rec.ownerUserId).toBe("u1");
    expect(rec.boothSessionId).toBeNull();
  });

  it("marks degraded within grace after engine disconnect", () => {
    const rec = createEmptyAnchorRecord("u1");
    registerAnchorSession({
      rec,
      boothSessionId: "sess-a",
      anchorSecretHash: "hash-a",
      now: 0,
    });
    markEngineSocket(rec, "ws-1", 0);
    clearEngineSocket(rec, "ws-1", 1000);
    expect(enginePresence(rec, 1000 + BOOTH_ENGINE_GRACE_MS - 1)).toBe("degraded");
    expect(enginePresence(rec, 1000 + BOOTH_ENGINE_GRACE_MS)).toBe("offline");
  });

  it("allows operator cap only when engine socket is live", () => {
    const rec = createEmptyAnchorRecord("u1");
    registerAnchorSession({
      rec,
      boothSessionId: "sess-a",
      anchorSecretHash: "hash-a",
      now: 0,
    });
    markEngineSocket(rec, "ws-1", 0);
    expect(canMintOperatorCap(publicAnchorStatus(rec, 0))).toBe(true);

    clearEngineSocket(rec, "ws-1", 1000);
    const degraded = publicAnchorStatus(rec, 1000 + 1000);
    expect(degraded.presence).toBe("degraded");
    expect(degraded.online).toBe(true);
    expect(canMintOperatorCap(degraded)).toBe(false);
  });

  it("engine presence heartbeat updates guest count only", () => {
    const rec = createEmptyAnchorRecord("u1");
    registerAnchorSession({
      rec,
      boothSessionId: "sess-a",
      anchorSecretHash: "hash-a",
      now: 0,
    });
    applyEnginePresence(rec, 2, 500);
    markEngineSocket(rec, "ws-1", 500);
    applyEnginePresence(rec, 3, 600);
    expect(rec.guestCount).toBe(3);
    expect(rec.snapshot).toBeNull();
  });

  it("cacheEngineSnapshot stores operator-pulled snapshot", () => {
    const rec = createEmptyAnchorRecord("u1");
    registerAnchorSession({
      rec,
      boothSessionId: "sess-a",
      anchorSecretHash: "hash-a",
      now: 0,
    });
    markEngineSocket(rec, "ws-1", 500);
    cacheEngineSnapshot(rec, { sessionId: "s1", guestCount: 1, cast: { kind: "live" } });
    expect(publicAnchorStatus(rec, 600).snapshot).toEqual({
      sessionId: "s1",
      guestCount: 1,
      cast: { kind: "live" },
    });
    expect(rec.guestCount).toBe(1);
  });

  it("revoke clears session", () => {
    const rec = createEmptyAnchorRecord("u1");
    registerAnchorSession({
      rec,
      boothSessionId: "sess-a",
      anchorSecretHash: "hash-a",
      now: 0,
    });
    revokeAnchor(rec, 1);
    expect(publicAnchorStatus(rec, 1).online).toBe(false);
  });
});
