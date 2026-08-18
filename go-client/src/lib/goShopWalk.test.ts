import { describe, expect, it } from "vitest";
import {
  createLobbyCollisionGrid,
  defaultLobbyAvatarPosition,
  isCircleBlocked,
  moveAvatarWithCollision,
  readLobbyWalkPreference,
  walkInputToward,
  hasWalkArrived,
  resolveLobbyTap,
  walkInputFromKey,
  facingFromWalkInput,
  walkInputActive,
  walkAnimFrame,
  resolveWalkBump,
  LOBBY_AVATAR_RADIUS,
  LOBBY_WALK_FRAME_MS,
} from "./goShopWalk";
import { LOBBY_BOSS, LOBBY_CABINETS, LOBBY_CHAT } from "./goLobbyLayout";
import { cabinetStandPoint } from "./goLobbyCabinets";

describe("lobby walk preference", () => {
  it("defaults to on when storage is empty", () => {
    const storage = { getItem: () => null, setItem: () => {} };
    expect(readLobbyWalkPreference(storage, false)).toBe(true);
  });

  it("forces off when reduced motion", () => {
    const storage = { getItem: () => "on", setItem: () => {} };
    expect(readLobbyWalkPreference(storage, true)).toBe(false);
  });

  it("ignores a stored off preference so walking stays on", () => {
    const storage = { getItem: () => "off", setItem: () => {} };
    expect(readLobbyWalkPreference(storage, false)).toBe(true);
  });
});

describe("moveAvatarWithCollision", () => {
  const grid = createLobbyCollisionGrid();

  it("moves right on open floor", () => {
    const start = defaultLobbyAvatarPosition();
    const next = moveAvatarWithCollision(
      start,
      { up: false, down: false, left: false, right: true },
      0.16,
      grid
    );
    expect(next.x).toBeGreaterThan(start.x);
  });

  it("does not pass through blocked counter", () => {
    const pos = { x: LOBBY_BOSS.x + 20, y: LOBBY_BOSS.y + LOBBY_BOSS.h + 12 };
    expect(isCircleBlocked(LOBBY_BOSS.x + 20, LOBBY_BOSS.y + 8, 6, grid)).toBe(
      true
    );
    const next = moveAvatarWithCollision(
      pos,
      { up: true, down: false, left: false, right: false },
      0.5,
      grid
    );
    expect(next.y).toBe(pos.y);
  });

  it("walks from spawn to the counter front", () => {
    let pos = defaultLobbyAvatarPosition();
    const target = {
      x: LOBBY_BOSS.x + LOBBY_BOSS.w / 2,
      y: LOBBY_BOSS.y + LOBBY_BOSS.h + 8,
    };
    for (let i = 0; i < 400; i += 1) {
      if (hasWalkArrived(pos, target)) break;
      const moved = moveAvatarWithCollision(
        pos,
        walkInputToward(pos, target),
        1 / 60,
        grid
      );
      if (moved.x === pos.x && moved.y === pos.y) break;
      pos = moved;
    }
    expect(hasWalkArrived(pos, target)).toBe(true);
    expect(isCircleBlocked(pos.x, pos.y, LOBBY_AVATAR_RADIUS, grid)).toBe(
      false
    );
  });
});

describe("walkInputToward", () => {
  it("points right toward target", () => {
    const input = walkInputToward({ x: 10, y: 10 }, { x: 40, y: 10 });
    expect(input.right).toBe(true);
    expect(input.left).toBe(false);
  });

  it("stops when arrived", () => {
    const from = { x: 20, y: 20 };
    const to = { x: 22, y: 21 };
    expect(hasWalkArrived(from, to)).toBe(true);
    expect(walkInputToward(from, to)).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
    });
  });

  it("maps arrow keys onto walk input", () => {
    const moved = walkInputFromKey(
      { up: false, down: false, left: false, right: false },
      "ArrowRight",
      true
    );
    expect(moved).toEqual({
      up: false,
      down: false,
      left: false,
      right: true,
    });
    expect(walkInputFromKey(moved!, "ArrowRight", false)?.right).toBe(false);
    expect(walkInputFromKey(moved!, "Enter", true)).toBeNull();
  });
});

describe("createLobbyCollisionGrid", () => {
  it("blocks the back wall band", () => {
    const grid = createLobbyCollisionGrid();
    expect(isCircleBlocked(160, 8, LOBBY_AVATAR_RADIUS, grid)).toBe(true);
    expect(isCircleBlocked(160, 40, LOBBY_AVATAR_RADIUS, grid)).toBe(false);
  });
});

describe("resolveLobbyTap", () => {
  it("activates the tapped hotspot, not the nearest one", () => {
    const world = { x: 120, y: 130 };
    expect(
      resolveLobbyTap({
        walkEnabled: true,
        world,
        tappedHotspot: "storage",
      })
    ).toEqual({ type: "activate", id: "storage" });
  });

  it("walks to a cabinet before playing when walking is on", () => {
    const cab = LOBBY_CABINETS[0]!;
    const stand = cabinetStandPoint(0);
    expect(
      resolveLobbyTap({
        walkEnabled: true,
        world: { x: cab.x + 2, y: cab.y + 2 },
        tappedHotspot: "cabinet",
        from: { x: 160, y: 168 },
        cabinetIndex: 0,
        cabinetStand: stand,
      })
    ).toEqual({
      type: "walk-then-activate",
      target: stand,
      id: "cabinet",
      cabinetIndex: 0,
    });
  });

  it("plays immediately when already at the cabinet", () => {
    const stand = cabinetStandPoint(0);
    expect(
      resolveLobbyTap({
        walkEnabled: true,
        world: { x: LOBBY_CABINETS[0]!.x + 2, y: LOBBY_CABINETS[0]!.y + 2 },
        tappedHotspot: "cabinet",
        from: stand,
        cabinetIndex: 0,
        cabinetStand: stand,
      })
    ).toEqual({ type: "activate", id: "cabinet" });
  });

  it("walks when tapping open floor", () => {
    const world = { x: 80, y: 170 };
    expect(
      resolveLobbyTap({
        walkEnabled: true,
        world,
        tappedHotspot: null,
      })
    ).toEqual({ type: "walk", target: world });
  });

  it("activates immediately in tap mode", () => {
    expect(
      resolveLobbyTap({
        walkEnabled: false,
        world: { x: 120, y: 130 },
        tappedHotspot: "storage",
      })
    ).toEqual({ type: "activate", id: "storage" });
  });
});

describe("walk facing and frames", () => {
  it("keeps the last facing when idle", () => {
    expect(
      facingFromWalkInput(
        { up: false, down: false, left: false, right: false },
        "left"
      )
    ).toBe("left");
  });

  it("prefers vertical facing on diagonals", () => {
    expect(
      facingFromWalkInput(
        { up: true, down: false, left: true, right: false },
        "down"
      )
    ).toBe("up");
    expect(
      facingFromWalkInput(
        { up: false, down: true, left: false, right: true },
        "left"
      )
    ).toBe("down");
  });

  it("cycles walk frames only while moving", () => {
    expect(walkInputActive({ up: false, down: false, left: false, right: false })).toBe(
      false
    );
    expect(walkAnimFrame(0, false)).toBe(0);
    expect(walkAnimFrame(LOBBY_WALK_FRAME_MS, true)).toBe(1);
    expect(walkAnimFrame(LOBBY_WALK_FRAME_MS * 4, true)).toBe(0);
  });
});

describe("resolveWalkBump", () => {
  const up = { up: true, down: false, left: false, right: false };
  const idle = { up: false, down: false, left: false, right: false };

  it("activates the counter when walking into it", () => {
    const from = {
      x: LOBBY_BOSS.x + LOBBY_BOSS.w / 2,
      y: LOBBY_BOSS.y + LOBBY_BOSS.h + 8,
    };
    const first = resolveWalkBump({
      from,
      input: up,
      alreadyContact: null,
      deltaSec: 0.05,
    });
    expect(first.activate).toBe("boss");
    expect(first.contact).toBe("boss");
    const held = resolveWalkBump({
      from,
      input: up,
      alreadyContact: first.contact,
      deltaSec: 0.05,
    });
    expect(held.activate).toBeNull();
    expect(held.contact).toBe("boss");
  });

  it("activates the chat lounge when walking into the table", () => {
    const from = {
      x: LOBBY_CHAT.x + LOBBY_CHAT.w / 2,
      y: LOBBY_CHAT.y + LOBBY_CHAT.h + 8,
    };
    expect(
      resolveWalkBump({
        from,
        input: up,
        alreadyContact: null,
        deltaSec: 0.05,
      }).activate
    ).toBe("chat");
  });

  it("activates a cabinet when walking into a machine", () => {
    const cab = LOBBY_CABINETS[0]!;
    const from = {
      x: cab.x + cab.w / 2,
      y: cab.y + cab.h + 8,
    };
    const bump = resolveWalkBump({
      from,
      input: up,
      alreadyContact: null,
      deltaSec: 0.05,
    });
    expect(bump.activate).toBe("cabinet");
  });

  it("does not activate on open floor or while idle", () => {
    expect(
      resolveWalkBump({
        from: defaultLobbyAvatarPosition(),
        input: up,
        alreadyContact: null,
        deltaSec: 0.05,
      }).activate
    ).toBeNull();
    expect(
      resolveWalkBump({
        from: {
          x: LOBBY_BOSS.x + LOBBY_BOSS.w / 2,
          y: LOBBY_BOSS.y + LOBBY_BOSS.h + 8,
        },
        input: idle,
        alreadyContact: "boss",
      })
    ).toEqual({ activate: null, contact: null });
  });

  it("does not activate when walking away from the counter", () => {
    const down = { up: false, down: true, left: false, right: false };
    const from = {
      x: LOBBY_BOSS.x + LOBBY_BOSS.w / 2,
      y: LOBBY_BOSS.y + LOBBY_BOSS.h + 2,
    };
    expect(
      resolveWalkBump({
        from,
        input: down,
        alreadyContact: null,
        deltaSec: 0.05,
      }).activate
    ).toBeNull();
  });

  it("does not activate when walking away from the counter's side", () => {
    const right = { up: false, down: false, left: false, right: true };
    const from = {
      x: LOBBY_BOSS.x + LOBBY_BOSS.w + 2,
      y: LOBBY_BOSS.y + LOBBY_BOSS.h / 2,
    };
    expect(
      resolveWalkBump({
        from,
        input: right,
        alreadyContact: null,
        deltaSec: 0.05,
      }).activate
    ).toBeNull();
  });

  it("activates when walking into the counter from the side", () => {
    const left = { up: false, down: false, left: true, right: false };
    const from = {
      x: LOBBY_BOSS.x + LOBBY_BOSS.w + 8,
      y: LOBBY_BOSS.y + LOBBY_BOSS.h / 2,
    };
    expect(
      resolveWalkBump({
        from,
        input: left,
        alreadyContact: null,
        deltaSec: 0.05,
      }).activate
    ).toBe("boss");
  });
});
