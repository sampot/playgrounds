import { describe, expect, it } from "vitest";
import {
  GO_ROOM_OPERATOR_CONNECTING_BODY,
  GO_ROOM_OPERATOR_CONNECTING_TITLE,
  GO_ROOM_OPERATOR_GATE_BODY,
  GO_ROOM_OPERATOR_GATE_BUTTON,
  GO_ROOM_OPERATOR_GATE_TITLE,
  operatorRemoteUiPhase,
  readOperatorCapFromSearch,
  roomOperatorLoginGate,
  shouldMintOperatorCapOnLogin,
} from "./operatorRemote";

describe("readOperatorCapFromSearch", () => {
  it("reads cap query param", () => {
    expect(
      readOperatorCapFromSearch(new URLSearchParams("cap=pg_op_abc123"))
    ).toBe("pg_op_abc123");
  });

  it("returns empty when cap is missing or blank", () => {
    expect(readOperatorCapFromSearch(new URLSearchParams(""))).toBe("");
    expect(readOperatorCapFromSearch(new URLSearchParams("cap="))).toBe("");
    expect(readOperatorCapFromSearch(new URLSearchParams("cap=%20"))).toBe("");
  });
});

describe("roomOperatorLoginGate", () => {
  it("shows login when no cap and not logged in", () => {
    expect(
      roomOperatorLoginGate({
        capFromUrl: false,
        loggedIn: false,
        phase: "idle",
        clientReady: true,
      })
    ).toBe(true);
  });

  it("hides login when cap is in the URL", () => {
    expect(
      roomOperatorLoginGate({
        capFromUrl: true,
        loggedIn: false,
        phase: "idle",
        clientReady: true,
      })
    ).toBe(false);
  });

  it("hides login once logged in", () => {
    expect(
      roomOperatorLoginGate({
        capFromUrl: false,
        loggedIn: true,
        phase: "idle",
        clientReady: true,
      })
    ).toBe(false);
  });

  it("waits for clientReady", () => {
    expect(
      roomOperatorLoginGate({
        capFromUrl: false,
        loggedIn: false,
        phase: "idle",
        clientReady: false,
      })
    ).toBe(false);
  });
});

describe("shouldMintOperatorCapOnLogin", () => {
  it("mints when logged in without cap and not yet started", () => {
    expect(
      shouldMintOperatorCapOnLogin({
        capFromUrl: false,
        loggedIn: true,
        mintStarted: false,
      })
    ).toBe(true);
  });

  it("skips when cap is already in the URL", () => {
    expect(
      shouldMintOperatorCapOnLogin({
        capFromUrl: true,
        loggedIn: true,
        mintStarted: false,
      })
    ).toBe(false);
  });

  it("skips after mint already started", () => {
    expect(
      shouldMintOperatorCapOnLogin({
        capFromUrl: false,
        loggedIn: true,
        mintStarted: true,
      })
    ).toBe(false);
  });
});

describe("operatorRemoteUiPhase", () => {
  it("uses minting as connecting before shell status exists", () => {
    expect(
      operatorRemoteUiPhase({
        mintPhase: "minting",
        shellPhase: null,
      })
    ).toBe("connecting");
  });

  it("prefers shell phase once available", () => {
    expect(
      operatorRemoteUiPhase({
        mintPhase: "idle",
        shellPhase: "open",
      })
    ).toBe("open");
  });

  it("maps mint error to error phase", () => {
    expect(
      operatorRemoteUiPhase({
        mintPhase: "error",
        shellPhase: null,
      })
    ).toBe("error");
  });
});

describe("operator remote copy", () => {
  it("uses connect-back wording distinct from host gate", () => {
    expect(GO_ROOM_OPERATOR_GATE_TITLE).toContain("連回");
    expect(GO_ROOM_OPERATOR_GATE_BODY).not.toContain("請人進來");
    expect(GO_ROOM_OPERATOR_GATE_BUTTON).toContain("連回");
    expect(GO_ROOM_OPERATOR_CONNECTING_TITLE).toContain("連回");
    expect(GO_ROOM_OPERATOR_CONNECTING_BODY.length).toBeGreaterThan(0);
  });
});
