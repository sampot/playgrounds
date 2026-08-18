import {
  GO_LOBBY_WORLD,
} from "./goShopHotspots";
import {
  clampAvatarToWorld,
  createLobbyCollisionGrid,
  hasWalkArrived,
  isCircleBlocked,
  LOBBY_AVATAR_RADIUS,
  walkInputToward,
  type LobbyCollisionGrid,
  type Vec2,
  type WalkInput,
} from "./goShopWalk";

export const LOBBY_PATH_CELL = 8;

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function pathCols(): number {
  return Math.ceil(GO_LOBBY_WORLD.width / LOBBY_PATH_CELL);
}

function pathRows(): number {
  return Math.ceil(GO_LOBBY_WORLD.height / LOBBY_PATH_CELL);
}

function cellCenter(cx: number, cy: number): Vec2 {
  return {
    x: (cx + 0.5) * LOBBY_PATH_CELL,
    y: (cy + 0.5) * LOBBY_PATH_CELL,
  };
}

function cellIndex(pos: Vec2): { cx: number; cy: number } {
  return {
    cx: Math.max(
      0,
      Math.min(pathCols() - 1, Math.floor(pos.x / LOBBY_PATH_CELL))
    ),
    cy: Math.max(
      0,
      Math.min(pathRows() - 1, Math.floor(pos.y / LOBBY_PATH_CELL))
    ),
  };
}

function key(cx: number, cy: number, cols: number): number {
  return cy * cols + cx;
}

function isCellWalkable(
  cx: number,
  cy: number,
  cols: number,
  rows: number,
  grid: LobbyCollisionGrid
): boolean {
  if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
  const p = cellCenter(cx, cy);
  return !isCircleBlocked(p.x, p.y, LOBBY_AVATAR_RADIUS, grid);
}

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

function hasLineOfSight(
  a: Vec2,
  b: Vec2,
  grid: LobbyCollisionGrid
): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / 4));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (isCircleBlocked(x, y, LOBBY_AVATAR_RADIUS, grid)) return false;
  }
  return true;
}

function simplifyPath(points: Vec2[], grid: LobbyCollisionGrid): Vec2[] {
  if (points.length <= 2) return points;
  const out: Vec2[] = [points[0]!];
  let i = 0;
  while (i < points.length - 1) {
    let far = i + 1;
    for (let j = i + 2; j < points.length; j += 1) {
      if (hasLineOfSight(points[i]!, points[j]!, grid)) far = j;
    }
    out.push(points[far]!);
    i = far;
  }
  return out;
}

function nearestWalkableCell(
  pos: Vec2,
  grid: LobbyCollisionGrid
): { cx: number; cy: number } | null {
  const cols = pathCols();
  const rows = pathRows();
  let best: { cx: number; cy: number; d: number } | null = null;
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      if (!isCellWalkable(cx, cy, cols, rows, grid)) continue;
      const p = cellCenter(cx, cy);
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (!best || d < best.d) best = { cx, cy, d };
    }
  }
  return best;
}

/** Closest point the avatar can stand, preferring the click itself when clear. */
export function nearestWalkablePoint(
  pos: Vec2,
  grid: LobbyCollisionGrid = createLobbyCollisionGrid()
): Vec2 | null {
  const clamped = clampAvatarToWorld(pos);
  if (!isCircleBlocked(clamped.x, clamped.y, LOBBY_AVATAR_RADIUS, grid)) {
    return clamped;
  }
  const cell = nearestWalkableCell(clamped, grid);
  if (!cell) return null;
  return cellCenter(cell.cx, cell.cy);
}

function astar(
  start: { cx: number; cy: number },
  goal: { cx: number; cy: number },
  grid: LobbyCollisionGrid
): { cx: number; cy: number }[] {
  const cols = pathCols();
  const rows = pathRows();
  const n = cols * rows;
  const gScore = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const startK = key(start.cx, start.cy, cols);
  gScore[startK] = 0;

  const open: number[] = [startK];
  let bestK = startK;
  let bestH = octile(start.cx, start.cy, goal.cx, goal.cy);

  const neighbors = (
    cx: number,
    cy: number
  ): { cx: number; cy: number; cost: number }[] => {
    const out: { cx: number; cy: number; cost: number }[] = [];
    for (const [dx, dy] of ORTHO) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isCellWalkable(nx, ny, cols, rows, grid)) continue;
      out.push({ cx: nx, cy: ny, cost: 1 });
    }
    for (const [dx, dy] of DIAG) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isCellWalkable(nx, ny, cols, rows, grid)) continue;
      if (
        !isCellWalkable(cx + dx, cy, cols, rows, grid) ||
        !isCellWalkable(cx, cy + dy, cols, rows, grid)
      ) {
        continue;
      }
      out.push({ cx: nx, cy: ny, cost: Math.SQRT2 });
    }
    return out;
  };

  while (open.length > 0) {
    let bestI = 0;
    let bestF = Infinity;
    for (let i = 0; i < open.length; i += 1) {
      const k = open[i]!;
      const cx = k % cols;
      const cy = Math.floor(k / cols);
      const f = gScore[k]! + octile(cx, cy, goal.cx, goal.cy);
      if (f < bestF) {
        bestF = f;
        bestI = i;
      }
    }
    const current = open.splice(bestI, 1)[0]!;
    const cx = current % cols;
    const cy = Math.floor(current / cols);
    if (closed[current]) continue;
    closed[current] = 1;

    const h = octile(cx, cy, goal.cx, goal.cy);
    if (h < bestH) {
      bestH = h;
      bestK = current;
    }
    if (cx === goal.cx && cy === goal.cy) {
      bestK = current;
      break;
    }

    for (const nb of neighbors(cx, cy)) {
      const nk = key(nb.cx, nb.cy, cols);
      if (closed[nk]) continue;
      const tentative = gScore[current]! + nb.cost;
      if (tentative >= gScore[nk]!) continue;
      gScore[nk] = tentative;
      parent[nk] = current;
      open.push(nk);
    }
  }

  const cells: { cx: number; cy: number }[] = [];
  let k = bestK;
  while (k >= 0) {
    cells.push({ cx: k % cols, cy: Math.floor(k / cols) });
    k = parent[k]!;
  }
  cells.reverse();
  return cells;
}

/** World-space waypoints from `from` to the nearest walkable point to `to`. */
export function planLobbyWalk(
  from: Vec2,
  to: Vec2,
  grid: LobbyCollisionGrid = createLobbyCollisionGrid()
): Vec2[] {
  const startPos =
    nearestWalkablePoint(from, grid) ?? clampAvatarToWorld(from);
  const dest = nearestWalkablePoint(to, grid) ?? startPos;
  const start = nearestWalkableCell(startPos, grid);
  const goal = nearestWalkableCell(dest, grid);
  if (!start || !goal) return [dest];

  const cells = astar(start, goal, grid);
  const points: Vec2[] = [startPos];
  for (const c of cells) {
    points.push(cellCenter(c.cx, c.cy));
  }
  points.push(dest);
  const simplified = simplifyPath(points, grid);
  if (simplified.length === 0) return [dest];
  return simplified;
}

export function followLobbyPath(
  pos: Vec2,
  path: readonly Vec2[]
): { input: WalkInput; path: Vec2[]; arrived: boolean } {
  const remaining = path.slice();
  while (remaining.length > 0 && hasWalkArrived(pos, remaining[0]!)) {
    remaining.shift();
  }
  if (remaining.length === 0) {
    return {
      input: { up: false, down: false, left: false, right: false },
      path: [],
      arrived: true,
    };
  }
  return {
    input: walkInputToward(pos, remaining[0]!),
    path: remaining,
    arrived: false,
  };
}
