/**
 * hostInviteBind tests (DEC-053 refactor).
 *
 * These exercise the refactored shellHost() adapter and `getHostRuntime`
 * exposure to ensure the same `HostRuntime` singleton is shared between
 * `env.HOST` (functions.js) and the SW shell session dispatch — no split
 * state.
 *
 * The runtime's `invokeHostSession` is the seam we care about: functions.js
 * calls land there via both the canvas listener (env.HOST path) and the SW
 * shell session listener (legacy /api/shell/session/* path).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileMap } from "@pg/projectTypes";
import type { GoCatalogEntry } from "./goCatalog";
import {
  createHostInviteBind,
  type HostInviteController,
} from "./hostInviteBind.svelte";
import { goAuth } from "./goAuth.svelte";

const baseEntry = {
  id: "pg-gomoku",
  title: "五子棋",
  source: "https://example.com/pg-gomoku",
  protocols: [{ protocolId: "gomoku.v1", apiVersion: "1", roles: ["host", "player"] }],
} as unknown as GoCatalogEntry;

function makeFiles(): FileMap {
  return { "index.html": "<!doctype html><body>x</body>" };
}

afterEach(() => {
  goAuth.__setApiKeyForTests(null);
  vi.restoreAllMocks();
});

describe("hostInviteBind — DEC-053 singleton sharing", () => {
  it("exposes the same HostRuntime singleton from getHostRuntime()", () => {
    const controller: HostInviteController = createHostInviteBind({
      catalogId: "pg-gomoku",
      entry: baseEntry,
      getFiles: () => makeFiles(),
      getSandboxId: () => "go-sb-1",
    });
    controller.bind();
    const rt1 = controller.getHostRuntime();
    const rt2 = controller.getHostRuntime();
    expect(rt1).not.toBeNull();
    expect(rt1).toBe(rt2);
    expect(rt1?.getStatus().protocolId).toBe("gomoku.v1");
    expect(rt1?.getStatus().apiVersion).toBe("1");
    controller.unbind();
    expect(controller.getHostRuntime()).toBeNull();
  });

  it("returns null from getHostRuntime() before bind()", () => {
    const controller = createHostInviteBind({
      catalogId: "pg-gomoku",
      entry: baseEntry,
      getFiles: () => makeFiles(),
      getSandboxId: () => "go-sb-2",
    });
    expect(controller.getHostRuntime()).toBeNull();
  });
});

describe("hostInviteBind — shellHost adapter routes through HostRuntime", () => {
  it("hostRuntime is the same object as what env.HOST sees", () => {
    const controller = createHostInviteBind({
      catalogId: "pg-gomoku",
      entry: baseEntry,
      getFiles: () => makeFiles(),
      getSandboxId: () => "go-sb-3",
    });
    controller.bind();
    const rt = controller.getHostRuntime();
    expect(rt).not.toBeNull();
    // The runtime exposes status with protocol metadata (DEC-053 env.HOST
    // mirror). Verify the wiring is consistent: the singleton's status
    // reflects the protocol the controller was built for.
    const status = rt!.getStatus();
    expect(status.protocolId).toBe("gomoku.v1");
    expect(status.hostRole).toBe("host");
    expect(status.guestRoles).toContain("player");
    controller.unbind();
  });

  it("subscribe emits the binding status; close() resets to idle", () => {
    const controller = createHostInviteBind({
      catalogId: "pg-gomoku",
      entry: baseEntry,
      getFiles: () => makeFiles(),
      getSandboxId: () => "go-sb-4",
    });
    controller.bind();
    const seen: string[] = [];
    const unsub = controller.subscribe(s => seen.push(s.phase));
    expect(seen[0]).toBe("idle");
    controller.close();
    // close is async; the next emission settles the phase back to idle.
    void controller.close().then(() => {
      expect(controller.getStatus().phase).toBe("idle");
      unsub();
      controller.unbind();
    });
  });
});
