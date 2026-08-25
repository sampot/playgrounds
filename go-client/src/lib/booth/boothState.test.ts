import { describe, expect, it } from "vitest";
import { boothShellCanDirect, pickOperatorDirectorRole } from "./boothState";

describe("pickOperatorDirectorRole", () => {
  it("grants director to a connecting operator even when host holds the lock", () => {
    expect(
      pickOperatorDirectorRole({
        shellId: "op-remote",
        director: { shellId: "host-local", role: "host" },
      })
    ).toEqual({
      role: "operator",
      director: { shellId: "op-remote", role: "operator" },
    });
  });

  it("replaces an existing operator director with a newer operator shell", () => {
    expect(
      pickOperatorDirectorRole({
        shellId: "op-b",
        director: { shellId: "op-a", role: "operator" },
      })
    ).toEqual({
      role: "operator",
      director: { shellId: "op-b", role: "operator" },
    });
  });
});

describe("boothShellCanDirect", () => {
  it("lets host direct when no director lock exists", () => {
    expect(
      boothShellCanDirect({
        director: null,
        shellId: "host-local",
        role: "host",
      })
    ).toBe(true);
  });

  it("blocks host when an operator holds director", () => {
    expect(
      boothShellCanDirect({
        director: { shellId: "op-remote", role: "operator" },
        shellId: "host-local",
        role: "host",
      })
    ).toBe(false);
  });

  it("lets the operator shell with the lock direct", () => {
    expect(
      boothShellCanDirect({
        director: { shellId: "op-remote", role: "operator" },
        shellId: "op-remote",
        role: "operator",
      })
    ).toBe(true);
  });
});
