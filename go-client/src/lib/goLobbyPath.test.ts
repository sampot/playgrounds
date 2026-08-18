import { describe, expect, it } from "vitest";
import { LOBBY_BOSS, LOBBY_STORAGE } from "./goLobbyLayout";
import {
  createLobbyCollisionGrid,
  defaultLobbyAvatarPosition,
  hasWalkArrived,
  isCircleBlocked,
  LOBBY_AVATAR_RADIUS,
  moveAvatarWithCollision,
  walkInputToward,
} from "./goShopWalk";
import {
  followLobbyPath,
  nearestWalkablePoint,
  planLobbyWalk,
} from "./goLobbyPath";

describe("planLobbyWalk", () => {
  const grid = createLobbyCollisionGrid();
  const spawn = defaultLobbyAvatarPosition();

  it("returns a walkable destination when tapping open floor", () => {
    const dest = { x: 200, y: 168 };
    const path = planLobbyWalk(spawn, dest, grid);
    expect(path.length).toBeGreaterThan(0);
    const end = path[path.length - 1]!;
    expect(hasWalkArrived(end, dest)).toBe(true);
    expect(isCircleBlocked(end.x, end.y, LOBBY_AVATAR_RADIUS, grid)).toBe(
      false
    );
  });

  it("snaps a click inside furniture to nearby walkable floor", () => {
    const inside = {
      x: LOBBY_BOSS.x + 20,
      y: LOBBY_BOSS.y + 12,
    };
    expect(isCircleBlocked(inside.x, inside.y, LOBBY_AVATAR_RADIUS, grid)).toBe(
      true
    );
    const snapped = nearestWalkablePoint(inside, grid);
    expect(snapped).not.toBeNull();
    expect(
      isCircleBlocked(snapped!.x, snapped!.y, LOBBY_AVATAR_RADIUS, grid)
    ).toBe(false);
  });

  it("routes around cabinets when a straight line is blocked", () => {
    const start = { x: 32, y: 160 };
    const target = { x: 32, y: 80 };
    expect(isCircleBlocked(start.x, start.y, LOBBY_AVATAR_RADIUS, grid)).toBe(
      false
    );
    expect(
      isCircleBlocked(target.x, target.y, LOBBY_AVATAR_RADIUS, grid)
    ).toBe(false);

    let greedy = { ...start };
    for (let i = 0; i < 400; i += 1) {
      if (hasWalkArrived(greedy, target)) break;
      const moved = moveAvatarWithCollision(
        greedy,
        walkInputToward(greedy, target),
        1 / 60,
        grid
      );
      if (moved.x === greedy.x && moved.y === greedy.y) break;
      greedy = moved;
    }
    expect(hasWalkArrived(greedy, target)).toBe(false);

    let pos = { ...start };
    let path = planLobbyWalk(pos, target, grid);
    expect(path.length).toBeGreaterThan(1);
    for (let i = 0; i < 800; i += 1) {
      const step = followLobbyPath(pos, path);
      path = step.path;
      if (step.arrived) break;
      const moved = moveAvatarWithCollision(pos, step.input, 1 / 60, grid);
      if (moved.x === pos.x && moved.y === pos.y) break;
      pos = moved;
    }
    expect(hasWalkArrived(pos, target)).toBe(true);
  });

  it("does not path through the storage door", () => {
    const path = planLobbyWalk(
      spawn,
      {
        x: LOBBY_STORAGE.x + LOBBY_STORAGE.w / 2,
        y: LOBBY_STORAGE.y + LOBBY_STORAGE.h / 2,
      },
      grid
    );
    for (const p of path) {
      expect(isCircleBlocked(p.x, p.y, LOBBY_AVATAR_RADIUS, grid)).toBe(false);
    }
  });
});
