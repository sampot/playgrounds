import { describe, expect, it } from "vitest";
import { HOST_CAPABILITIES } from "./hostCapabilities";
import {
  SESSION_API_VERSION,
  SESSION_CAPABILITIES,
  SESSION_MAX_AGENT_SEATS,
} from "./sessionCapabilities";

describe("session + host session capabilities (DEC-023)", () => {
  it("SESSION capability list matches binding surface", () => {
    expect(SESSION_API_VERSION).toBe("1");
    expect(SESSION_MAX_AGENT_SEATS).toBe(4);
    expect(SESSION_CAPABILITIES).toEqual([
      "apiVersion",
      "capabilities",
      "getSeat",
      "getState",
      "getEventChannel",
      "act",
      "leave",
    ]);
  });

  it("HOST capabilities include session management methods", () => {
    for (const name of [
      "openSession",
      "closeSession",
      "pauseSession",
      "resumeSession",
      "getSession",
      "listSeats",
      "joinSeat",
      "leaveSeat",
      "spawnParticipant",
      "hostSessionFetch",
    ] as const) {
      expect(HOST_CAPABILITIES).toContain(name);
    }
  });
});
