/** Per-mech game/app/html/css/test generators for genre backlog scaffold. */

const THEMES = {
  night: { bg: "#14081f", accent: "#ffb703", panel: "#2a1540" },
  coast: { bg: "#0b1f2a", accent: "#48cae4", panel: "#123447" },
  field: { bg: "#1a2f1a", accent: "#b5e48c", panel: "#2d4a2d" },
  alley: { bg: "#1c1410", accent: "#f4a261", panel: "#3a2a22" },
  roof: { bg: "#1a1520", accent: "#e9c46a", panel: "#302438" },
  sea: { bg: "#071525", accent: "#90e0ef", panel: "#0f2a40" },
  temple: { bg: "#2a1810", accent: "#e76f51", panel: "#4a2c1c" },
  war: { bg: "#1b1510", accent: "#e9c46a", panel: "#32281c" },
  islands: { bg: "#0d2137", accent: "#76c893", panel: "#16324f" },
  arcade: { bg: "#120a1f", accent: "#ff6bcb", panel: "#2a1840" },
  cards: { bg: "#1a1025", accent: "#c77dff", panel: "#2e1b45" },
  market: { bg: "#1c1208", accent: "#f4a261", panel: "#3a2814" },
  dungeon: { bg: "#0d0d12", accent: "#adb5bd", panel: "#1c1c28" },
  village: { bg: "#1e2a1a", accent: "#95d5b2", panel: "#2f402c" },
  island: { bg: "#10252a", accent: "#64dfdf", panel: "#1a3a40" },
  siege: { bg: "#24140f", accent: "#f77f00", panel: "#3d2418" },
  court: { bg: "#1a1528", accent: "#cdb4db", panel: "#2c2440" },
  quest: { bg: "#15201c", accent: "#80ed99", panel: "#243830" },
  fort: { bg: "#0f1c2e", accent: "#4cc9f0", panel: "#1a3150" },
  noir: { bg: "#121212", accent: "#ffd166", panel: "#242424" },
  town: { bg: "#1f1828", accent: "#ffafcc", panel: "#322840" },
  campus: { bg: "#1a2230", accent: "#a2d2ff", panel: "#2a3548" },
  school: { bg: "#0a0a0f", accent: "#ef233c", panel: "#1a1a24" },
  heist: { bg: "#141820", accent: "#00f5d4", panel: "#222a38" },
  city: { bg: "#1a1e28", accent: "#8ecae6", panel: "#2a3140" },
  port: { bg: "#0f1e2e", accent: "#219ebc", panel: "#1c3348" },
  food: { bg: "#2a1812", accent: "#ff9f1c", panel: "#42281c" },
  harbor: { bg: "#0c2430", accent: "#56cfe1", panel: "#163848" },
  room: { bg: "#1a1410", accent: "#e9c46a", panel: "#302820" },
  attic: { bg: "#221a12", accent: "#d4a373", panel: "#3a2e22" },
  lab: { bg: "#101820", accent: "#80ffdb", panel: "#1c2c38" },
  festival: { bg: "#2a1020", accent: "#ff85a1", panel: "#401830" },
  lantern: { bg: "#1a0f08", accent: "#ff9e00", panel: "#3a2010" },
  neon: { bg: "#050510", accent: "#00f5d4", panel: "#101828" },
  storm: { bg: "#101018", accent: "#ffd60a", panel: "#222230" },
  stage: { bg: "#180a20", accent: "#ff6bcb", panel: "#301040" },
  morning: { bg: "#1e2430", accent: "#ffd166", panel: "#303848" },
  mansion: { bg: "#16120f", accent: "#c9ada7", panel: "#2c2420" },
  chase: { bg: "#120818", accent: "#ff4d6d", panel: "#281430" },
  arena: { bg: "#141028", accent: "#7b2cbf", panel: "#281848" },
};

function theme(g) {
  return THEMES[g.theme] || THEMES.night;
}

/** Shared pure helpers embedded into every game.js */
const HELPERS = `
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function deep(o) { return JSON.parse(JSON.stringify(o)); }
`;

function mechBody(g) {
  const m = g.mech;
  // Each returns createGame / applyAction / getLegalActions / summarize / getOutcome exports
  const table = {
    fighter: `
export function createGame({ seed = 1, mode = "versus" } = {}) {
  return {
    seed, mode, round: 1, wins: { you: 0, foe: 0 },
    you: { hp: 100, block: 0, guard: false, name: "亭仔腳阿傑" },
    foe: { hp: 100, stun: 0, guard: false, name: "騎樓阿強" },
    log: ["三局兩勝。拳／踢／防／大招。"],
    outcome: "playing",
  };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["punch", "kick", "block", "special"];
}
function aiPick(s, rnd) {
  const r = rnd();
  if (s.you.guard) return r < 0.5 ? "kick" : "special";
  return ["punch", "kick", "block", "special"][Math.floor(rnd() * 4)];
}
function hit(atk, def, kind) {
  if (def.guard && kind !== "special") return Math.floor(atk * 0.25);
  if (kind === "punch") return 12 + Math.floor(Math.random() * 6);
  if (kind === "kick") return 16 + Math.floor(Math.random() * 8);
  if (kind === "special") return 28;
  return 0;
}
export function applyAction(state, action) {
  if (state.outcome !== "playing") return state;
  const s = deep(state);
  const rnd = mulberry32(s.seed + s.round * 17 + s.you.hp);
  const foeAct = aiPick(s, rnd);
  s.you.guard = action === "block";
  s.foe.guard = foeAct === "block";
  if (action !== "block") {
    const dmg = hit(1, s.foe, action);
    s.foe.hp = clamp(s.foe.hp - dmg, 0, 100);
    s.log.unshift(\`你出\${action} −\${dmg}\`);
  } else s.log.unshift("你防禦");
  if (foeAct !== "block") {
    const dmg = hit(1, s.you, foeAct);
    s.you.hp = clamp(s.you.hp - dmg, 0, 100);
    s.log.unshift(\`對手\${foeAct} −\${dmg}\`);
  }
  if (s.foe.hp <= 0 || s.you.hp <= 0) {
    if (s.foe.hp <= 0) s.wins.you++; else s.wins.foe++;
    if (s.wins.you >= 2) { s.outcome = "won"; s.log.unshift("你贏了這場對決！"); }
    else if (s.wins.foe >= 2) { s.outcome = "lost"; s.log.unshift("敗北…再修練。"); }
    else {
      s.round++;
      s.you.hp = 100; s.foe.hp = 100;
      s.log.unshift(\`第 \${s.round} 局\`);
    }
  }
  return s;
}
export function summarize(s) {
  return { round: s.round, youHp: s.you.hp, foeHp: s.foe.hp, wins: s.wins, log: s.log.slice(0, 5), outcome: s.outcome };
}
export function getOutcome(s) { return s.outcome; }
`,
    brawler: `
export function createGame({ seed = 1 } = {}) {
  return { seed, x: 0, stage: 1, hp: 5, kills: 0, enemies: spawn(1, seed), score: 0, outcome: "playing", msg: "往右清街！點擊攻擊靠近的敵人。" };
}
function spawn(stage, seed) {
  const rnd = mulberry32(seed + stage * 9);
  const n = 3 + stage;
  return Array.from({ length: n }, (_, i) => ({ id: i, x: 40 + i * 18 + rnd() * 10, hp: 1 + Math.floor(stage / 2), boss: i === n - 1 }));
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["move", "attack"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  if (action === "move") {
    s.x = clamp(s.x + 8, 0, 100);
    s.msg = \`前進到 \${s.x}%\`;
  } else {
    const near = s.enemies.find((e) => e.hp > 0 && Math.abs(e.x - s.x) < 14);
    if (!near) { s.msg = "太遠了，再靠近"; s.hp = clamp(s.hp - 0, 0, 5); }
    else {
      near.hp--;
      s.score += near.boss ? 50 : 10;
      s.kills++;
      s.msg = near.hp <= 0 ? (near.boss ? "頭目倒下！" : "打倒一名混混") : "命中！";
    }
    for (const e of s.enemies) {
      if (e.hp > 0 && Math.abs(e.x - s.x) < 10 && Math.random() < 0.35) {
        s.hp--;
        s.msg += " 被反擊！";
      }
    }
  }
  if (s.hp <= 0) { s.outcome = "lost"; s.msg = "你被撂倒了"; }
  else if (s.enemies.every((e) => e.hp <= 0)) {
    if (s.stage >= 3) { s.outcome = "won"; s.msg = "夜市清街完成！"; }
    else { s.stage++; s.enemies = spawn(s.stage, s.seed); s.msg = \`進入第 \${s.stage} 段\`; }
  }
  return s;
}
export function summarize(s) {
  return { stage: s.stage, x: s.x, hp: s.hp, score: s.score, enemies: s.enemies.filter(e=>e.hp>0).length, msg: s.msg, outcome: s.outcome };
}
export function getOutcome(s) { return s.outcome; }
`,
    racer: `
export function createGame({ seed = 1, track = 0, upgrades = { speed: 0, handling: 0 } } = {}) {
  return { seed, track, upgrades, lap: 1, progress: 0, time: 0, best: null, nitro: 3, outcome: "playing", msg: "三圈完賽。加速／漂移。" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["accel", "drift", "nitro"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const spd = 8 + s.upgrades.speed * 2;
  const hand = 1 + s.upgrades.handling * 0.15;
  let gain = action === "accel" ? spd : action === "drift" ? spd * 0.7 * hand : spd * 1.6;
  if (action === "nitro") {
    if (s.nitro <= 0) { s.msg = "氮氣用完"; return s; }
    s.nitro--;
  }
  s.progress += gain;
  s.time += 1;
  if (s.progress >= 100) {
    s.progress = 0;
    s.lap++;
    s.msg = \`完成第 \${s.lap - 1} 圈\`;
    if (s.lap > 3) {
      s.outcome = "won";
      s.best = s.time;
      s.msg = \`完賽！用時 \${s.time} 拍\`;
    }
  } else s.msg = action === "drift" ? "漂移過彎" : action === "nitro" ? "氮氣加速！" : "直線催速";
  return s;
}
export function summarize(s) {
  return { lap: s.lap, progress: Math.floor(s.progress), time: s.time, nitro: s.nitro, msg: s.msg, outcome: s.outcome, upgrades: s.upgrades };
}
export function getOutcome(s) { return s.outcome; }
`,
    soccer: `
export function createGame({ seed = 1 } = {}) {
  return { seed, you: 0, foe: 0, minute: 0, possession: "you", outcome: "playing", msg: "先得三分。傳球／射門／搶斷。" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return s.possession === "you" ? ["pass", "shoot"] : ["tackle", "press"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const rnd = mulberry32(s.seed + s.minute * 3);
  s.minute++;
  if (action === "shoot") {
    if (rnd() < 0.42) { s.you++; s.msg = "進球！！"; }
    else { s.msg = "射偏／被撲"; s.possession = "foe"; }
  } else if (action === "pass") {
    s.msg = rnd() < 0.8 ? "漂亮傳球" : "傳球被斷";
    if (rnd() >= 0.8) s.possession = "foe";
  } else if (action === "tackle") {
    if (rnd() < 0.55) { s.possession = "you"; s.msg = "搶斷成功"; }
    else { s.msg = "犯規險些…對手續攻"; if (rnd() < 0.25) { s.foe++; s.msg = "對手破門"; } }
  } else {
    if (rnd() < 0.3) { s.foe++; s.msg = "高壓失敗，對手進球"; }
    else { s.possession = "you"; s.msg = "逼出失誤"; }
  }
  if (s.you >= 3) { s.outcome = "won"; s.msg = "操場勝利！"; }
  if (s.foe >= 3) { s.outcome = "lost"; s.msg = "惜敗"; }
  if (s.minute >= 20 && s.outcome === "playing") {
    s.outcome = s.you > s.foe ? "won" : s.you < s.foe ? "lost" : "won";
    s.msg = \`終場 \${s.you}:\${s.foe}\`;
  }
  return s;
}
export function summarize(s) {
  return { score: \`\${s.you}:\${s.foe}\`, minute: s.minute, possession: s.possession, msg: s.msg, outcome: s.outcome };
}
export function getOutcome(s) { return s.outcome; }
`,
    bowling: `
export function createGame({ seed = 1 } = {}) {
  return { seed, frame: 1, balls: 0, pins: 10, score: 0, frames: [], outcome: "playing", power: 50, msg: "調力度後投球。十格。" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["powerDown", "powerUp", "throw"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  if (action === "powerUp") { s.power = clamp(s.power + 10, 10, 100); s.msg = \`力度 \${s.power}\`; return s; }
  if (action === "powerDown") { s.power = clamp(s.power - 10, 10, 100); s.msg = \`力度 \${s.power}\`; return s; }
  const rnd = mulberry32(s.seed + s.frame * 11 + s.balls);
  const ideal = 70;
  const accuracy = 1 - Math.abs(s.power - ideal) / 100;
  const knocked = clamp(Math.round((6 + rnd() * 4) * (0.5 + accuracy)), 0, s.pins);
  s.pins -= knocked;
  s.balls++;
  s.score += knocked;
  s.msg = knocked === 10 && s.balls === 1 ? "全倒！" : \`擊倒 \${knocked} 支\`;
  if (s.pins === 0 || s.balls >= 2) {
    s.frames.push({ frame: s.frame, score: 10 - s.pins });
    s.frame++;
    s.balls = 0;
    s.pins = 10;
    if (s.frame > 10) { s.outcome = "won"; s.msg = \`完賽分數 \${s.score}\`; }
  }
  return s;
}
export function summarize(s) {
  return { frame: s.frame, pins: s.pins, score: s.score, power: s.power, msg: s.msg, outcome: s.outcome };
}
export function getOutcome(s) { return s.outcome; }
`,
    skate: `
export function createGame({ seed = 1 } = {}) {
  return { seed, dist: 0, combo: 0, score: 0, heat: 0, outcome: "playing", msg: "跳／磨桿連段。" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["ollie", "grind", "manual"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const rnd = mulberry32(s.seed + s.dist);
  s.dist += 5;
  const ok = rnd() < (action === "grind" ? 0.7 : 0.85);
  if (!ok) {
    s.combo = 0;
    s.msg = "摔了！連段歸零";
    if (rnd() < 0.15) { s.outcome = "lost"; s.msg = "重摔出局"; }
  } else {
    s.combo++;
    const pts = (action === "ollie" ? 10 : action === "grind" ? 25 : 15) * s.combo;
    s.score += pts;
    s.msg = \`\${action} ×\${s.combo} +\${pts}\`;
  }
  if (s.dist >= 100) { s.outcome = "won"; s.msg = \`路線完成！\${s.score} 分\`; }
  return s;
}
export function summarize(s) {
  return { dist: s.dist, combo: s.combo, score: s.score, msg: s.msg, outcome: s.outcome };
}
export function getOutcome(s) { return s.outcome; }
`,
    dogfight: `
export function createGame({ seed = 1, mission = 1 } = {}) {
  return { seed, mission, hp: 5, foes: 3 + mission, score: 0, ammo: 12, outcome: "playing", msg: \`任務 \${mission}：擊墜敵機\` };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["bank", "fire", "flare"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const rnd = mulberry32(s.seed + s.foes * 5 + s.ammo);
  if (action === "fire") {
    if (s.ammo <= 0) { s.msg = "彈藥耗盡"; return s; }
    s.ammo--;
    if (rnd() < 0.55) { s.foes--; s.score += 100; s.msg = "擊墜！"; }
    else s.msg = "彈幕掠過";
  } else if (action === "bank") {
    s.msg = "側滾迴避";
    if (rnd() < 0.2) { s.hp--; s.msg = "擦彈受傷"; }
  } else {
    if (rnd() < 0.7) s.msg = "熱焰彈誘偏飛彈";
    else { s.hp--; s.msg = "誘餌失敗"; }
  }
  if (rnd() < 0.25 && action !== "bank") { s.hp--; s.msg += "／被咬尾"; }
  if (s.hp <= 0) s.outcome = "lost";
  else if (s.foes <= 0) {
    if (s.mission >= 3) { s.outcome = "won"; s.msg = "海峽空域肅清"; }
    else { s.mission++; s.foes = 3 + s.mission; s.ammo += 6; s.msg = \`進入任務 \${s.mission}\`; }
  }
  return s;
}
export function summarize(s) {
  return { mission: s.mission, hp: s.hp, foes: s.foes, ammo: s.ammo, score: s.score, msg: s.msg, outcome: s.outcome };
}
export function getOutcome(s) { return s.outcome; }
`,
    arpg: `
export function createGame({ seed = 1 } = {}) {
  return { seed, room: 1, hp: 30, atk: 5, skillCd: 0, gold: 0, loot: [], foes: 4, outcome: "playing", msg: "斬擊／技能清房。" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return s.skillCd <= 0 ? ["slash", "skill", "potion"] : ["slash", "potion"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const rnd = mulberry32(s.seed + s.room * 13 + s.foes);
  if (s.skillCd > 0) s.skillCd--;
  if (action === "potion") {
    s.hp = clamp(s.hp + 12, 0, 40);
    s.msg = "喝下金紙符水";
  } else if (action === "skill") {
    s.skillCd = 3;
    const dmg = s.atk * 3;
    s.foes = clamp(s.foes - 2, 0, 99);
    s.msg = \`迴旋斬清退（\${dmg}）\`;
  } else {
    s.foes = clamp(s.foes - 1, 0, 99);
    s.msg = "普通斬擊";
  }
  if (s.foes > 0 && rnd() < 0.5) {
    s.hp -= 3 + s.room;
    s.msg += " · 被擊中";
  }
  if (s.hp <= 0) s.outcome = "lost";
  else if (s.foes <= 0) {
    s.gold += 10 + s.room * 5;
    if (rnd() < 0.5) { s.loot.push("符紙+" + s.room); s.atk++; }
    if (s.room >= 5) { s.outcome = "won"; s.msg = "廟口陣破！"; }
    else { s.room++; s.foes = 3 + s.room; s.msg = \`進入第 \${s.room} 房\`; }
  }
  return s;
}
export function summarize(s) {
  return { room: s.room, hp: s.hp, atk: s.atk, foes: s.foes, gold: s.gold, skillCd: s.skillCd, loot: s.loot, msg: s.msg, outcome: s.outcome };
}
export function getOutcome(s) { return s.outcome; }
`,
    srpg: `
export function createGame({ seed = 1, chapter = 1 } = {}) {
  const units = [
    { id: "s", name: "矛", type: "spear", hp: 12, x: 0, y: 1, side: "you" },
    { id: "a", name: "弓", type: "bow", hp: 8, x: 0, y: 2, side: "you" },
    { id: "c", name: "騎", type: "cavalry", hp: 14, x: 0, y: 0, side: "you" },
    { id: "e1", name: "敵矛", type: "spear", hp: 10, x: 4, y: 1, side: "foe" },
    { id: "e2", name: "敵弓", type: "bow", hp: 8, x: 4, y: 2, side: "foe" },
  ];
  return { seed, chapter, turn: 1, units, selected: "s", outcome: "playing", msg: "相剋：矛>騎>弓>矛。點選行動。" };
}
const beat = { spear: "cavalry", cavalry: "bow", bow: "spear" };
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["move", "attack", "wait", "nextUnit"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const u = s.units.find((x) => x.id === s.selected && x.side === "you" && x.hp > 0);
  if (!u) { s.selected = s.units.find((x) => x.side === "you" && x.hp > 0)?.id; return s; }
  if (action === "nextUnit") {
    const yours = s.units.filter((x) => x.side === "you" && x.hp > 0);
    const i = yours.findIndex((x) => x.id === s.selected);
    s.selected = yours[(i + 1) % yours.length].id;
    s.msg = \`選中 \${yours[(i + 1) % yours.length].name}\`;
    return s;
  }
  if (action === "move") {
    u.x = clamp(u.x + 1, 0, 4);
    s.msg = \`\${u.name} 前進至 (\${u.x},\${u.y})\`;
  } else if (action === "attack") {
    const foe = s.units.find((x) => x.side === "foe" && x.hp > 0 && Math.abs(x.x - u.x) + Math.abs(x.y - u.y) <= 2);
    if (!foe) s.msg = "射程內無敵";
    else {
      let dmg = 4;
      if (beat[u.type] === foe.type) dmg = 8;
      if (beat[foe.type] === u.type) dmg = 2;
      foe.hp -= dmg;
      s.msg = \`\${u.name} 攻擊 \${foe.name} −\${dmg}\`;
    }
  } else s.msg = "待機";
  // foe AI
  for (const e of s.units.filter((x) => x.side === "foe" && x.hp > 0)) {
    const t = s.units.find((x) => x.side === "you" && x.hp > 0);
    if (!t) break;
    if (e.x > t.x) e.x--; else if (e.x < t.x) e.x++;
    if (Math.abs(e.x - t.x) + Math.abs(e.y - t.y) <= 2) {
      t.hp -= beat[e.type] === t.type ? 6 : 3;
    }
  }
  s.turn++;
  if (!s.units.some((x) => x.side === "you" && x.hp > 0)) s.outcome = "lost";
  else if (!s.units.some((x) => x.side === "foe" && x.hp > 0)) {
    if (s.chapter >= 3) { s.outcome = "won"; s.msg = "戰役勝利！"; }
    else {
      s.chapter++;
      return createGame({ seed: s.seed + s.chapter, chapter: s.chapter });
    }
  }
  return s;
}
export function summarize(s) {
  return {
    chapter: s.chapter, turn: s.turn, selected: s.selected, msg: s.msg, outcome: s.outcome,
    you: s.units.filter((x) => x.side === "you").map((x) => \`\${x.name}:\${x.hp}\`),
    foe: s.units.filter((x) => x.side === "foe").map((x) => \`\${x.name}:\${x.hp}\`),
  };
}
export function getOutcome(s) { return s.outcome; }
`,
  };

  // Generic progression template for remaining mechs
  const generic = (label, actions, stepFn) => `
export function createGame({ seed = 1 } = {}) {
  return { seed, turn: 0, score: 0, level: 1, meter: 0, resources: 10, flags: {}, log: ["${label}"], outcome: "playing", msg: "${label}" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ${JSON.stringify(actions)};
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const rnd = mulberry32(s.seed + s.turn * 19);
  s.turn++;
  ${stepFn}
  if (s.resources < 0) s.resources = 0;
  if (s.outcome === "playing" && s.level >= 5 && s.meter >= 100) {
    s.outcome = "won";
    s.msg = "目標達成！";
  }
  if (s.outcome === "playing" && (s.resources <= 0 && s.meter < 20 && s.turn > 8)) {
    s.outcome = "lost";
    s.msg = "資源崩盤";
  }
  return s;
}
export function summarize(s) {
  return { turn: s.turn, level: s.level, meter: s.meter, score: s.score, resources: s.resources, msg: s.msg, outcome: s.outcome, flags: s.flags };
}
export function getOutcome(s) { return s.outcome; }
`;

  if (table[m]) return table[m];

  const generics = {
    "4x": generic("島鏈紀元：探索／擴張／開發／征服", ["explore", "expand", "develop", "conquer"], `
  if (action === "explore") { s.meter += 8 + rnd()*8; s.resources -= 1; s.msg = "發現新島礁"; }
  else if (action === "expand") { s.level = clamp(s.level + (rnd()<0.5?1:0), 1, 5); s.resources -= 2; s.meter += 10; s.msg = "建立據點"; }
  else if (action === "develop") { s.resources += 3; s.score += 15; s.msg = "開發產業"; }
  else { s.meter += 15; s.resources -= 2; s.score += 20; s.msg = "出兵征服"; if (rnd()<0.2) { s.resources -= 3; s.msg += "（苦戰）"; } }
  s.score += Math.floor(s.meter / 10);
`),
    autochess: generic("自走軍團：購買／佈陣／开战", ["buy", "sell", "place", "fight"], `
  if (action === "buy") { if (s.resources >= 3) { s.resources -= 3; s.flags.units = (s.flags.units||0)+1; s.msg = "買入單位"; } else s.msg = "金幣不足"; }
  else if (action === "sell") { if ((s.flags.units||0)>0) { s.flags.units--; s.resources += 2; s.msg = "賣出"; } else s.msg = "沒有單位"; }
  else if (action === "place") { s.flags.synergy = Math.min(3, (s.flags.units||0)); s.msg = "調整站位 羈絆"+s.flags.synergy; }
  else {
    const power = (s.flags.units||0) + (s.flags.synergy||0);
    const enemy = 2 + s.level;
    if (power >= enemy) { s.level++; s.meter += 25; s.resources += 5; s.score += 50; s.msg = "回合勝利"; }
    else { s.resources -= 2; s.msg = "敗北，利息減少"; }
  }
`),
    deckrogue: generic("牌途登峰：戰鬥／休息／遺物", ["strike", "defend", "card", "rest"], `
  s.flags.hp = s.flags.hp ?? 30;
  s.flags.energy = s.flags.energy ?? 3;
  if (action === "rest") { s.flags.hp = clamp(s.flags.hp+8,0,40); s.meter += 10; s.msg = "篝火休息"; s.level = Math.min(5, s.level+ (s.meter%40===0?1:0)); }
  else if (action === "defend") { s.flags.block = 5; s.msg = "防禦姿勢"; }
  else if (action === "card") { s.score += 20; s.meter += 12; s.flags.relic = (s.flags.relic||0)+ (rnd()<0.3?1:0); s.msg = "抽到強力牌"; }
  else {
    const dmg = 6 + (s.flags.relic||0)*2;
    s.meter += dmg;
    s.score += dmg;
    if (rnd()<0.4) s.flags.hp -= 4;
    s.msg = "打擊 "+dmg;
    if (s.flags.hp <= 0) { s.outcome = "lost"; s.msg = "倒下了"; }
  }
  if (s.meter >= 100) { s.level = 5; }
`),
    ccg: generic("卡市爭鋒：構築／對戰／解鎖", ["draw", "play", "mulligan", "rank"], `
  s.flags.deck = s.flags.deck ?? 20;
  if (action === "draw") { s.flags.hand = clamp((s.flags.hand||0)+1,0,7); s.msg = "抽牌"; }
  else if (action === "mulligan") { s.flags.hand = 3; s.msg = "調度手牌"; }
  else if (action === "play") {
    if ((s.flags.hand||0)<=0) s.msg = "沒手牌";
    else { s.flags.hand--; s.meter += 10 + rnd()*10; s.score += 15; s.msg = "打出一張"; }
  } else {
    if (s.meter > 40) { s.level++; s.resources += 2; s.meter = 20; s.msg = "排位勝"; s.score += 40; }
    else { s.msg = "排位敗"; s.resources = Math.max(0, s.resources-1); }
  }
`),
    roguelike: generic("深窟探險：移動／攻擊／拾取", ["north", "east", "south", "west", "wait"], `
  s.flags.hunger = (s.flags.hunger ?? 20) - 1;
  s.flags.hp = s.flags.hp ?? 20;
  s.flags.light = s.flags.light ?? 5;
  if (action !== "wait") { s.meter += 5; s.score += 2; s.msg = "探索 "+action; if (rnd()<0.25) { s.flags.hp -= 3; s.msg += " 遭遇怪物"; } if (rnd()<0.2) { s.resources++; s.msg += " 拾取"; } }
  else { s.flags.hunger += 2; s.msg = "原地休息"; }
  s.flags.light = clamp(s.flags.light - (rnd()<0.3?1:0), 0, 8);
  if (s.flags.hunger <= 0 || s.flags.hp <= 0) { s.outcome = "lost"; s.msg = "飢餓或戰死"; }
  if (s.meter >= 100) { s.level = 5; s.msg = "找到出口"; }
`),
    god: generic("里民與天：賜福／降災／觀望", ["bless", "curse", "inspire", "wait"], `
  s.flags.pop = s.flags.pop ?? 20;
  s.flags.happy = s.flags.happy ?? 50;
  if (action === "bless") { s.flags.happy += 8; s.resources -= 1; s.msg = "甘霖"; }
  else if (action === "curse") { s.flags.happy -= 5; s.meter += 15; s.msg = "雷罰警世"; }
  else if (action === "inspire") { s.flags.pop += 2; s.flags.happy += 3; s.msg = "顯靈鼓舞"; }
  else { s.flags.happy -= 2; s.msg = "沉默的一天"; }
  s.meter = clamp(s.flags.happy, 0, 100);
  s.score = s.flags.pop * 2 + s.flags.happy;
  if (s.flags.pop >= 40 && s.flags.happy >= 70) { s.level = 5; s.meter = 100; }
  if (s.flags.happy <= 0) { s.outcome = "lost"; s.msg = "聚落潰散"; }
`),
    colony: generic("離島前哨：配工／進食／建設", ["farm", "build", "comfort", "ration"], `
  s.flags.food = s.flags.food ?? 10;
  s.flags.morale = s.flags.morale ?? 50;
  s.flags.people = s.flags.people ?? 4;
  if (action === "farm") { s.flags.food += 4; s.msg = "出海漁獲"; }
  else if (action === "build") { s.resources += 2; s.meter += 10; s.flags.food -= 1; s.msg = "加蓋工寮"; }
  else if (action === "comfort") { s.flags.morale += 10; s.resources -= 1; s.msg = "晚會鼓舞"; }
  else { s.flags.food -= s.flags.people; s.flags.morale -= 5; s.msg = "配給"; }
  s.flags.food -= Math.ceil(s.flags.people / 2);
  if (s.flags.food < 0) { s.flags.morale -= 15; s.flags.food = 0; }
  s.score = s.flags.people * 10 + s.flags.morale;
  s.meter = clamp(s.flags.morale, 0, 100);
  if (s.turn >= 12 && s.flags.morale >= 40) { s.level = 5; s.meter = 100; }
  if (s.flags.morale <= 0) { s.outcome = "lost"; s.msg = "殖民者離去"; }
`),
    rtd: generic("攻城推波：產兵／升級／進攻", ["spawn", "upgrade", "push", "eco"], `
  if (action === "eco") { s.resources += 4; s.msg = "收稅"; }
  else if (action === "spawn") { if (s.resources >= 2) { s.resources -= 2; s.flags.army = (s.flags.army||0)+1; s.msg = "召募"; } else s.msg = "缺金"; }
  else if (action === "upgrade") { if (s.resources >= 3) { s.resources -= 3; s.flags.pow = (s.flags.pow||0)+1; s.msg = "強化"; } else s.msg = "缺金"; }
  else {
    const atk = (s.flags.army||0) * (1 + (s.flags.pow||0));
    s.meter += atk * 8;
    s.score += atk * 5;
    s.msg = "推波傷害 "+(atk*8);
    if (rnd()<0.3) { s.flags.army = Math.max(0,(s.flags.army||0)-1); s.msg += "（有傷亡）"; }
  }
`),
    diplomacy: generic("圓桌協議：出價／同盟／施壓", ["bid", "ally", "sanction", "speech"], `
  s.flags.inf = s.flags.inf ?? 0;
  if (action === "bid") { s.resources -= 2; s.flags.inf += 3; s.msg = "密封出價"; }
  else if (action === "ally") { s.flags.inf += 2; s.meter += 10; s.msg = "締結同盟"; }
  else if (action === "sanction") { s.flags.inf += 1; s.resources += 1; s.msg = "經濟制裁對手"; }
  else { s.flags.inf += 4; s.msg = "演說爭取中立"; }
  s.meter = clamp(s.flags.inf * 5, 0, 100);
  s.score = s.flags.inf * 10;
  if (s.flags.inf >= 20) { s.level = 5; s.meter = 100; }
`),
    rpg: generic("結社遠征：前進／戰鬥／補給", ["march", "fight", "camp", "loot"], `
  s.flags.hp = s.flags.hp ?? 40;
  s.flags.chapter = s.flags.chapter ?? 1;
  if (action === "march") { s.meter += 8; s.msg = "行軍"; }
  else if (action === "camp") { s.flags.hp = clamp(s.flags.hp+10,0,50); s.msg = "紮營"; }
  else if (action === "loot") { s.resources += 3; s.score += 10; s.msg = "搜刮寶箱"; }
  else {
    const dmg = 5 + s.flags.chapter * 2;
    if (rnd() < 0.65) { s.meter += 20; s.score += 30; s.msg = "戰鬥勝利"; }
    else { s.flags.hp -= dmg; s.msg = "苦戰受傷"; }
  }
  if (s.flags.hp <= 0) { s.outcome = "lost"; s.msg = "全隊倒下"; }
  if (s.meter >= 33 && s.flags.chapter === 1) { s.flags.chapter = 2; s.msg = "第二章開始"; }
  if (s.meter >= 66 && s.flags.chapter === 2) { s.flags.chapter = 3; s.msg = "最終章"; }
  if (s.meter >= 100) { s.level = 5; }
`),
    metroidvania: generic("潮汐要塞：探索／能力", ["left", "right", "jump", "ability"], `
  s.flags.abilities = s.flags.abilities ?? [];
  s.flags.room = s.flags.room ?? 0;
  if (action === "ability") {
    if (!(s.flags.abilities.includes("dash")) && s.flags.room >= 2) { s.flags.abilities.push("dash"); s.msg = "習得衝刺"; }
    else if (!(s.flags.abilities.includes("swim")) && s.flags.room >= 4) { s.flags.abilities.push("swim"); s.msg = "習得潛泳"; }
    else s.msg = "此處無能力石";
  } else {
    s.flags.room = clamp(s.flags.room + (action === "left" ? -1 : 1), 0, 6);
    s.meter = s.flags.room * 15 + s.flags.abilities.length * 20;
    s.msg = "房間 "+s.flags.room+" 能力:"+s.flags.abilities.join("/");
    s.score += 5;
  }
  if (s.flags.abilities.length >= 2 && s.flags.room >= 6) { s.level = 5; s.meter = 100; }
`),
    adventure: generic("陳年卷宗：查看／組合／指認", ["look", "take", "combine", "accuse"], `
  s.flags.inv = s.flags.inv ?? [];
  s.flags.clues = s.flags.clues ?? 0;
  if (action === "look") { s.flags.clues++; s.msg = "發現線索"; s.meter += 10; }
  else if (action === "take") { s.flags.inv.push("物"+(s.flags.inv.length+1)); s.msg = "放入背包"; s.score += 5; }
  else if (action === "combine") {
    if (s.flags.inv.length >= 2) { s.flags.inv.pop(); s.flags.clues += 2; s.meter += 20; s.msg = "組合成關鍵證據"; }
    else s.msg = "道具不足";
  } else {
    if (s.flags.clues >= 5) { s.level = 5; s.meter = 100; s.msg = "指認成功"; s.outcome = "playing"; }
    else { s.msg = "證據不足被趕出"; s.resources -= 2; }
  }
`),
    vn: generic("鎮誌：行程／對話", ["work", "talkA", "talkB", "talkC", "rest"], `
  s.flags.day = (s.flags.day ?? 1);
  s.flags.a = s.flags.a ?? 0; s.flags.b = s.flags.b ?? 0; s.flags.c = s.flags.c ?? 0;
  if (action === "work") { s.resources += 2; s.msg = "打工賺生活費"; }
  else if (action === "talkA") { s.flags.a++; s.msg = "與里長多聊"; }
  else if (action === "talkB") { s.flags.b++; s.msg = "夜市攤商故事"; }
  else if (action === "talkC") { s.flags.c++; s.msg = "圖書館遇見故人"; }
  else { s.msg = "回家休息"; }
  s.flags.day++;
  s.meter = Math.max(s.flags.a, s.flags.b, s.flags.c) * 20;
  s.score = s.flags.a + s.flags.b + s.flags.c;
  if (s.flags.day >= 10) {
    s.level = 5; s.meter = 100;
    const best = Math.max(s.flags.a, s.flags.b, s.flags.c);
    s.msg = best === s.flags.a ? "結局：里坊共建" : best === s.flags.b ? "結局：夜市傳人" : "結局：靜謐書架";
  }
`),
    simdate: generic("社團心事：課表配置", ["study", "club", "date", "parttime"], `
  s.flags.stats = s.flags.stats ?? { wit: 1, charm: 1, stamina: 5 };
  s.flags.bond = s.flags.bond ?? 0;
  if (action === "study") { s.flags.stats.wit++; s.flags.stats.stamina--; s.msg = "圖書館"; }
  else if (action === "club") { s.flags.bond += 2; s.flags.stats.stamina--; s.msg = "社團活動"; }
  else if (action === "date") { if (s.flags.bond >= 4) { s.flags.bond += 3; s.msg = "告白成功氣氛"; s.meter += 20; } else s.msg = "還太早…"; s.flags.stats.stamina--; }
  else { s.resources += 2; s.flags.stats.stamina = clamp(s.flags.stats.stamina+1,0,8); s.msg = "打工"; }
  s.score = s.flags.bond * 10 + s.flags.stats.wit * 5;
  s.meter = clamp(s.flags.bond * 12, 0, 100);
  if (s.flags.stats.stamina <= 0) { s.outcome = "lost"; s.msg = "累垮"; }
  if (s.flags.bond >= 10) { s.level = 5; s.meter = 100; }
`),
    stealth: generic("查哨夜行：潛行", ["sneak", "wait", "KO", "extract"], `
  s.flags.alert = s.flags.alert ?? 0;
  s.flags.obj = s.flags.obj ?? false;
  if (action === "sneak") { s.meter += 10; if (rnd()<0.2) s.flags.alert += 2; s.msg = "貼牆前進"; }
  else if (action === "wait") { s.flags.alert = Math.max(0, s.flags.alert-1); s.msg = "等巡邏走過"; }
  else if (action === "KO") { if (rnd()<0.6) { s.meter += 15; s.msg = "制伏哨兵"; } else { s.flags.alert += 4; s.msg = "被發現！"; } }
  else {
    if (s.meter >= 60 && s.flags.alert < 5) { s.flags.obj = true; s.level = 5; s.meter = 100; s.msg = "撤離成功"; }
    else { s.flags.alert += 2; s.msg = "目標未清或警報過高"; }
  }
  if (s.flags.alert >= 8) { s.outcome = "lost"; s.msg = "全面戒備失敗"; }
`),
    horror: generic("廢校夜勤：恐懼", ["move", "listen", "hide", "useBattery"], `
  s.flags.battery = s.flags.battery ?? 5;
  s.flags.sanity = s.flags.sanity ?? 10;
  s.flags.keys = s.flags.keys ?? 0;
  if (action === "useBattery") { if (s.flags.battery>0) { s.flags.battery--; s.msg = "手電照亮"; s.meter += 5; } else s.msg = "沒電了"; }
  else if (action === "listen") { s.msg = rnd()<0.5 ? "腳步在左側" : "風聲…？"; s.flags.sanity -= 0; }
  else if (action === "hide") { s.msg = "屏息躲進置物櫃"; if (rnd()<0.15) { s.flags.sanity -= 3; s.msg = "它停在門外"; } }
  else {
    s.meter += 8;
    if (rnd()<0.35) { s.flags.sanity--; s.msg = "走廊移動，有動靜"; }
    else if (rnd()<0.2) { s.flags.keys++; s.msg = "找到鑰匙"; s.score += 20; }
    else s.msg = "前進";
  }
  if (s.flags.sanity <= 0) { s.outcome = "lost"; s.msg = "被黑暗吞沒"; }
  if (s.flags.keys >= 3) { s.level = 5; s.meter = 100; s.msg = "逃出廢校"; }
`),
    imsim: generic("後門任務：多解法", ["sneak", "talk", "fight", "hack"], `
  s.flags.path = s.flags.path ?? null;
  s.flags.progress = s.flags.progress ?? 0;
  if (!s.flags.path) { s.flags.path = action; s.msg = "選定路線："+action; }
  if (action !== s.flags.path) { s.msg = "本關專精 "+s.flags.path+"（可重開另選）"; }
  else {
    s.flags.progress += 25;
    s.meter = s.flags.progress;
    s.score += 25;
    s.msg = action + " 推進 "+s.flags.progress+"%";
  }
  if (s.flags.progress >= 100) { s.level = 5; s.meter = 100; s.msg = "任務完成（"+s.flags.path+"）"; }
`),
    city: generic("街區建國：分區", ["resi", "comm", "ind", "road"], `
  s.flags.pop = s.flags.pop ?? 0;
  s.flags.happy = s.flags.happy ?? 50;
  s.flags.pollution = s.flags.pollution ?? 0;
  if (action === "resi") { s.flags.pop += 5; s.resources -= 2; s.msg = "住宅區"; }
  else if (action === "comm") { s.resources += 3; s.flags.happy += 3; s.msg = "商業區"; }
  else if (action === "ind") { s.resources += 5; s.flags.pollution += 4; s.flags.happy -= 4; s.msg = "工業區"; }
  else { s.flags.happy += 2; s.resources -= 1; s.msg = "拓寬道路"; }
  s.flags.happy = clamp(s.flags.happy - Math.floor(s.flags.pollution/5), 0, 100);
  s.meter = clamp(s.flags.pop * 2, 0, 100);
  s.score = s.flags.pop * 5 + s.flags.happy;
  if (s.flags.pop >= 40 && s.flags.happy >= 40) { s.level = 5; s.meter = 100; }
  if (s.flags.happy <= 0) { s.outcome = "lost"; s.msg = "民怨炸鍋"; }
`),
    tycoon: generic("港口大亨：航線", ["route", "warehouse", "contract", "undercut"], `
  s.flags.cargo = s.flags.cargo ?? 0;
  s.flags.rival = s.flags.rival ?? 50;
  if (action === "route") { s.flags.cargo += 3; s.resources += 2; s.msg = "開航線"; }
  else if (action === "warehouse") { s.resources -= 3; s.flags.cap = (s.flags.cap||5)+3; s.msg = "擴倉"; }
  else if (action === "contract") { s.score += 40; s.meter += 15; s.flags.cargo = Math.max(0, s.flags.cargo-2); s.msg = "完成合約"; }
  else { s.flags.rival -= 8; s.resources -= 2; s.msg = "削價搶市"; }
  if (s.flags.rival <= 0) { s.level = 5; s.meter = 100; s.msg = "對手出局你稱霸"; }
`),
    kitchen: generic("總舖師：研發／營業", ["cook", "research", "hire", "expand"], `
  s.flags.recipes = s.flags.recipes ?? 1;
  s.flags.staff = s.flags.staff ?? 1;
  s.flags.shops = s.flags.shops ?? 1;
  if (action === "cook") { s.resources += 2 * s.flags.staff * s.flags.shops; s.score += 10; s.msg = "尖峰出餐"; }
  else if (action === "research") { s.resources -= 3; s.flags.recipes++; s.meter += 15; s.msg = "新菜單"; }
  else if (action === "hire") { s.resources -= 4; s.flags.staff++; s.msg = "雇用助手"; }
  else { if (s.resources >= 8) { s.resources -= 8; s.flags.shops++; s.msg = "第二間店！"; s.meter += 30; } else s.msg = "資金不足"; }
  if (s.flags.shops >= 2 && s.flags.recipes >= 4) { s.level = 5; s.meter = 100; }
`),
    fishing: generic("港邊釣夢：拋竿", ["cast", "reel", "changeSpot", "upgrade"], `
  s.flags.dex = s.flags.dex ?? [];
  s.flags.rod = s.flags.rod ?? 1;
  if (action === "upgrade") { if (s.resources >= 5) { s.resources -= 5; s.flags.rod++; s.msg = "強化釣竿"; } else s.msg = "錢不夠"; }
  else if (action === "changeSpot") { s.flags.spot = ((s.flags.spot||0)+1)%3; s.msg = "換漁場 "+s.flags.spot; }
  else if (action === "cast") { s.msg = "等待咬鉤…"; s.flags.bite = rnd() < 0.5 + s.flags.rod*0.1; }
  else {
    if (!s.flags.bite) s.msg = "空竿";
    else {
      const fish = ["虱目魚","白帶魚","石斑","鎖管"][Math.floor(rnd()*4)];
      if (!s.flags.dex.includes(fish)) s.flags.dex.push(fish);
      s.score += 20; s.meter = s.flags.dex.length * 20; s.resources += 2; s.msg = "釣上 "+fish;
      s.flags.bite = false;
    }
  }
  if (s.flags.dex.length >= 4) { s.level = 5; s.meter = 100; }
`),
    escape: generic("密室一小時：解謎", ["room1", "room2", "room3", "useCode"], `
  s.flags.codes = s.flags.codes ?? [];
  s.flags.room = s.flags.room ?? 1;
  if (action.startsWith("room")) {
    s.flags.room = Number(action.replace("room",""));
    s.msg = "進入房間 "+s.flags.room;
    if (rnd()<0.7) { const c = "C"+s.flags.room+(Math.floor(rnd()*9)); if (!s.flags.codes.includes(c)) s.flags.codes.push(c); s.msg += " 找到密碼 "+c; }
  } else {
    if (s.flags.codes.length >= 3) { s.level = 5; s.meter = 100; s.msg = "密碼正確，逃出！"; }
    else { s.msg = "還缺密碼"; s.meter = s.flags.codes.length * 30; }
  }
`),
    hog: generic("頂樓尋物：找物", ["search", "zoom", "hint", "nextScene"], `
  s.flags.found = s.flags.found ?? 0;
  s.flags.scene = s.flags.scene ?? 1;
  s.flags.target = s.flags.target ?? 5;
  if (action === "hint") { s.resources -= 1; s.msg = "提示：角落有反光"; }
  else if (action === "zoom") { s.msg = "放大檢視"; if (rnd()<0.4) { s.flags.found++; s.score += 10; s.msg = "找到物件！"; } }
  else if (action === "search") { if (rnd()<0.55) { s.flags.found++; s.score += 10; s.msg = "找到了"; } else s.msg = "沒找到"; }
  else {
    if (s.flags.found >= s.flags.target) { s.flags.scene++; s.flags.found = 0; s.msg = "場景 "+s.flags.scene; s.meter = s.flags.scene * 30; }
    else s.msg = "本景未找齊";
  }
  if (s.flags.scene > 3) { s.level = 5; s.meter = 100; s.msg = "頂樓故事完結"; }
`),
    portal: generic("對門實驗室：傳送", ["placeA", "placeB", "walk", "reset"], `
  s.flags.a = s.flags.a ?? null;
  s.flags.b = s.flags.b ?? null;
  s.flags.level = s.flags.level ?? 1;
  if (action === "placeA") { s.flags.a = Math.floor(rnd()*5); s.msg = "藍門 @"+s.flags.a; }
  else if (action === "placeB") { s.flags.b = Math.floor(rnd()*5); s.msg = "橙門 @"+s.flags.b; }
  else if (action === "reset") { s.flags.a = s.flags.b = null; s.msg = "重置門"; }
  else {
    if (s.flags.a != null && s.flags.b != null && s.flags.a !== s.flags.b) {
      s.flags.level++; s.meter = s.flags.level * 20; s.score += 30; s.msg = "動量穿門過關！";
      s.flags.a = s.flags.b = null;
    } else s.msg = "門未成對";
  }
  if (s.flags.level > 5) { s.level = 5; s.meter = 100; }
`),
    lemmings: generic("遶境人潮：指揮", ["dig", "build", "block", "spawn"], `
  s.flags.saved = s.flags.saved ?? 0;
  s.flags.alive = s.flags.alive ?? 0;
  if (action === "spawn") { s.flags.alive += 2; s.msg = "香客湧入"; }
  else if (action === "dig") { s.meter += 8; s.msg = "開路"; if (rnd()<0.5) { s.flags.saved++; s.flags.alive = Math.max(0,s.flags.alive-1); } }
  else if (action === "build") { s.meter += 10; s.resources -= 1; s.msg = "搭橋"; }
  else { s.msg = "擋人分流"; s.flags.alive = Math.max(0, s.flags.alive); s.meter += 5; }
  s.score = s.flags.saved * 20;
  if (s.flags.saved >= 8) { s.level = 5; s.meter = 100; s.msg = "人潮安然到廟"; }
`),
    snake: `
export function createGame({ seed = 1, mode = "levels" } = {}) {
  return { seed, mode, x: 5, y: 5, dir: "E", body: [[5,5],[4,5],[3,5]], food: [8,5], grow: 0, score: 0, level: 1, outcome: "playing", msg: "方向移動，吃燈籠。" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["N", "E", "S", "W"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const opp = { N:"S", S:"N", E:"W", W:"E" };
  if (opp[action] !== s.dir) s.dir = action;
  const d = { N:[0,-1], S:[0,1], E:[1,0], W:[-1,0] }[s.dir];
  const nx = s.x + d[0], ny = s.y + d[1];
  if (nx < 0 || ny < 0 || nx > 11 || ny > 11) { s.outcome = "lost"; s.msg = "撞牆"; return s; }
  if (s.body.some(([bx,by]) => bx===nx && by===ny)) { s.outcome = "lost"; s.msg = "咬到自己"; return s; }
  s.x = nx; s.y = ny;
  s.body.unshift([nx,ny]);
  if (nx === s.food[0] && ny === s.food[1]) {
    s.score += 10; s.grow += 1;
    s.food = [Math.floor(Math.random()*12), Math.floor(Math.random()*12)];
    s.msg = "吃到燈籠！";
    if (s.score >= s.level * 40) { s.level++; s.msg = "關卡 "+s.level; }
    if (s.level >= 5) { s.outcome = "won"; s.msg = "燈籠蛇達人"; }
  } else if (s.grow > 0) s.grow--; else s.body.pop();
  return s;
}
export function summarize(s) {
  return { score: s.score, level: s.level, len: s.body.length, head: [s.x,s.y], food: s.food, msg: s.msg, outcome: s.outcome };
}
export function getOutcome(s) { return s.outcome; }
`,
    tron: generic("光跡對決：轉向", ["left", "right", "straight", "boost"], `
  s.flags.trail = s.flags.trail ?? 0;
  s.flags.area = s.flags.area ?? 0;
  if (action === "boost") { s.flags.trail += 3; s.resources -= 1; s.msg = "加速劃線"; }
  else if (action === "straight") { s.flags.trail += 1; s.msg = "直線"; }
  else { s.flags.trail += 1; s.flags.area += 2; s.msg = "轉向包圍"; }
  s.meter = clamp(s.flags.area * 5, 0, 100);
  s.score = s.flags.area * 10;
  if (rnd() < 0.08) { s.outcome = "lost"; s.msg = "撞上光牆"; }
  if (s.flags.area >= 20) { s.level = 5; s.meter = 100; }
`),
    typing: generic("字幕風暴：打字", ["typeEasy", "typeHard", "typeBoss", "focus"], `
  const words = { typeEasy: 5, typeHard: 12, typeBoss: 25, focus: 0 };
  if (action === "focus") { s.flags.focus = 2; s.msg = "集中精神"; }
  else {
    const gain = words[action] * (1 + (s.flags.focus||0));
    s.flags.focus = 0;
    s.meter += gain;
    s.score += gain * 2;
    s.msg = "打完一波 +"+gain;
    if (rnd() < 0.15) { s.resources -= 1; s.msg += "（漏字掉血）"; }
  }
`),
    guitar: generic("琴弦節拍：撥弦", ["s1", "s2", "s3", "s4"], `
  s.flags.beat = (s.flags.beat ?? 0) + 1;
  const want = (s.flags.beat % 4) + 1;
  const got = Number(action.replace("s",""));
  if (got === want) { s.meter += 8; s.score += 10 * (1 + Math.floor(s.meter/40)); s.msg = "Perfect 弦"+got; s.flags.combo = (s.flags.combo||0)+1; }
  else { s.msg = "Miss（應撥弦"+want+"）"; s.flags.combo = 0; s.resources -= 0; }
  if (s.flags.beat >= 32 && s.meter >= 80) { s.level = 5; s.meter = 100; }
  if (s.flags.beat >= 40 && s.meter < 80) { s.outcome = "lost"; s.msg = "曲終未達標"; }
`),
    wordle: `
const WORDS = ["TAIPE","LUCKY","MANGO","STEAM","NIGHT","OCEAN","PLANT","RIVER","STONE","BRAVE"];
export function createGame({ seed = 1, daily = false } = {}) {
  const rnd = mulberry32(daily ? Math.floor(Date.now()/86400000) : seed);
  const answer = WORDS[Math.floor(rnd()*WORDS.length)];
  return { seed, answer, guesses: [], outcome: "playing", msg: "猜 5 字母（英文）。綠對位黃錯位。" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return WORDS.filter((w) => !s.guesses.includes(w)).slice(0, 8);
}
function scoreGuess(answer, guess) {
  return guess.split("").map((ch, i) => (answer[i] === ch ? "G" : answer.includes(ch) ? "Y" : "B")).join("");
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const g = String(action).toUpperCase().slice(0, 5);
  if (g.length !== 5) { s.msg = "需要 5 碼"; return s; }
  const pat = scoreGuess(s.answer, g);
  s.guesses.push(g);
  s.msg = g + " → " + pat;
  if (g === s.answer) { s.outcome = "won"; s.msg = "答對："+s.answer; }
  else if (s.guesses.length >= 6) { s.outcome = "lost"; s.msg = "答案是 "+s.answer; }
  return s;
}
export function summarize(s) {
  return { guesses: s.guesses, left: 6 - s.guesses.length, msg: s.msg, outcome: s.outcome };
}
export function getOutcome(s) { return s.outcome; }
`,
    clue: generic("誰是兇手：搜證", ["suggest", "ask", "accuse", "notebook"], `
  s.flags.truth = s.flags.truth ?? { who: "管家", where: "書房", what: "燭台" };
  s.flags.known = s.flags.known ?? [];
  if (action === "notebook") { s.msg = "筆記："+s.flags.known.join(", "); }
  else if (action === "ask") {
    const keys = ["who","where","what"];
    const k = keys[Math.floor(rnd()*3)];
    if (!s.flags.known.includes(k)) s.flags.known.push(k);
    s.msg = "問到關於 "+k;
    s.meter = s.flags.known.length * 30;
  } else if (action === "suggest") { s.score += 5; s.msg = "提出懷疑，對手出示卡"; s.meter += 10; }
  else {
    if (s.flags.known.length >= 3) { s.level = 5; s.meter = 100; s.msg = "指認正確："+JSON.stringify(s.flags.truth); }
    else { s.outcome = "lost"; s.msg = "錯控出局"; }
  }
`),
    asymmetric: generic("追匿：追捕／躲藏", ["huntMove", "huntScan", "hide", "dash"], `
  s.flags.role = s.flags.role ?? "hunter";
  s.flags.caught = s.flags.caught ?? 0;
  s.flags.hiders = s.flags.hiders ?? 2;
  if (action === "huntMove" || action === "huntScan") {
    s.flags.role = "hunter";
    if (rnd() < (action === "huntScan" ? 0.55 : 0.35)) { s.flags.caught++; s.flags.hiders--; s.msg = "抓到一名"; s.score += 30; }
    else s.msg = "搜尋中";
  } else {
    s.flags.role = "hider";
    s.meter += action === "dash" ? 15 : 8;
    s.msg = action === "dash" ? "衝刺換點" : "埋伏";
    if (rnd() < 0.2) { s.outcome = "lost"; s.msg = "被抓到了"; }
  }
  if (s.flags.caught >= 2) { s.level = 5; s.meter = 100; s.msg = "追捕方勝利"; }
  if (s.turn >= 15 && s.flags.hiders > 0 && s.flags.role === "hider") { s.level = 5; s.meter = 100; s.msg = "躲藏方撐住了"; }
`),
    quiz: generic("搶答聯賽：作答", ["easy", "medium", "hard", "bonus"], `
  const pts = { easy: 5, medium: 10, hard: 20, bonus: 30 };
  const p = pts[action];
  if (rnd() < (action === "easy" ? 0.85 : action === "medium" ? 0.65 : action === "hard" ? 0.45 : 0.35)) {
    s.score += p; s.meter += p; s.flags.rating = (s.flags.rating||1000) + p;
    s.msg = "答對 +"+p+"（Rating "+s.flags.rating+"）";
  } else {
    s.flags.rating = (s.flags.rating||1000) - Math.floor(p/2);
    s.msg = "答錯";
  }
  if (s.score >= 100) { s.level = 5; s.meter = 100; }
`),
    stocks: generic("夜盤：交易", ["buy", "sell", "hold", "rumor"], `
  s.flags.cash = s.flags.cash ?? 100;
  s.flags.shares = s.flags.shares ?? 0;
  s.flags.price = s.flags.price ?? 10;
  s.flags.price = clamp(s.flags.price + Math.floor((rnd()-0.45)*6), 3, 40);
  if (action === "rumor") { s.flags.price += Math.floor((rnd()-0.3)*8); s.msg = "小道消息影響盤勢"; }
  else if (action === "buy") { if (s.flags.cash >= s.flags.price) { s.flags.cash -= s.flags.price; s.flags.shares++; s.msg = "買入 @"+s.flags.price; } else s.msg = "現金不足"; }
  else if (action === "sell") { if (s.flags.shares > 0) { s.flags.shares--; s.flags.cash += s.flags.price; s.msg = "賣出 @"+s.flags.price; } else s.msg = "沒有持股"; }
  else s.msg = "觀望；現價 "+s.flags.price;
  const equity = s.flags.cash + s.flags.shares * s.flags.price;
  s.score = equity;
  s.meter = clamp(equity - 100, 0, 100);
  if (s.turn >= 12) { s.level = 5; s.meter = 100; s.msg = "收盤淨值 "+equity; if (equity < 80) s.outcome = "lost"; }
`),
    idle: generic("香火放置：升級", ["collect", "upgradeGen", "upgradeCap", "prestige"], `
  s.flags.gen = s.flags.gen ?? 1;
  s.flags.bank = s.flags.bank ?? 0;
  s.flags.offline = s.flags.offline ?? 0;
  if (action === "collect") {
    const gain = s.flags.gen * (2 + s.level);
    s.flags.bank += gain;
    s.resources += gain;
    s.meter = clamp(s.flags.bank / 5, 0, 100);
    s.score = s.flags.bank;
    s.msg = "收取香火 +"+gain;
  } else if (action === "upgradeGen") {
    if (s.flags.bank >= 10 * s.flags.gen) { s.flags.bank -= 10 * s.flags.gen; s.flags.gen++; s.msg = "香爐升級 lv"+s.flags.gen; }
    else s.msg = "香火不足";
  } else if (action === "upgradeCap") { s.level = clamp(s.level+1,1,5); s.msg = "擴大廟埕"; s.meter += 10; }
  else { if (s.flags.gen >= 3) { s.flags.gen = 1; s.flags.bank = 0; s.score += 100; s.meter = 100; s.level = 5; s.msg = "轉生加乘"; } else s.msg = "尚未可轉生"; }
`),
  };

  if (generics[m]) return generics[m];
  return generics.idle;
}

export function buildGameJs(g) {
  return `/** ${g.id} — ${g.title} (${g.genre}) */
${HELPERS}
${mechBody(g)}
`;
}

export function buildAppJs(g) {
  return `import { createGame, applyAction, getLegalActions, summarize, getOutcome } from "./game.js";
import { GameAudio } from "./audio.js";
import { loadProgress, saveProgress } from "./persist.js";

const audio = new GameAudio();
let state = createGame({ seed: Date.now() % 9999 });
let progress = {};

const $ = (sel) => document.querySelector(sel);

function label(action) {
  const map = {
    punch: "拳", kick: "踢", block: "防", special: "大招",
    move: "前進", attack: "攻擊", accel: "加速", drift: "漂移", nitro: "氮氣",
    pass: "傳球", shoot: "射門", tackle: "搶斷", press: "高壓",
    powerUp: "力度+", powerDown: "力度-", throw: "投球",
    ollie: "跳躍", grind: "磨桿", manual: "手動",
    bank: "側滾", fire: "開火", flare: "熱焰彈",
    slash: "斬擊", skill: "技能", potion: "符水",
    wait: "待機", nextUnit: "換單位",
    N: "↑", E: "→", S: "↓", W: "←",
  };
  return map[action] || action;
}

function render() {
  const view = summarize(state);
  const outcome = getOutcome(state);
  $("#msg").textContent = view.msg || "";
  $("#hud").textContent = Object.entries(view)
    .filter(([k]) => !["msg", "outcome", "log", "flags", "you", "foe", "guesses", "loot", "enemies", "upgrades"].includes(k))
    .map(([k, v]) => \`\${k}: \${typeof v === "object" ? JSON.stringify(v) : v}\`)
    .join(" · ");
  const extras = [];
  if (view.log) extras.push(view.log.join(" / "));
  if (view.you) extras.push("我軍 "+view.you.join(", "));
  if (view.foe) extras.push("敵軍 "+view.foe.join(", "));
  if (view.guesses) extras.push(view.guesses.join(" | "));
  if (view.loot) extras.push("loot "+view.loot.join(","));
  $("#extra").textContent = extras.join("\\n");
  const board = $("#board");
  board.innerHTML = "";
  const hero = document.createElement("img");
  hero.src = "./assets/images/hero.png";
  hero.alt = "";
  hero.className = "sprite hero";
  board.appendChild(hero);
  const rival = document.createElement("img");
  rival.src = "./assets/images/rival.png";
  rival.onerror = () => { rival.src = "./assets/images/enemy.png"; rival.onerror = () => { rival.remove(); }; };
  rival.alt = "";
  rival.className = "sprite rival";
  board.appendChild(rival);
  const meter = document.createElement("div");
  meter.className = "meter";
  const fill = document.createElement("i");
  fill.style.width = \`\${clampMeter(view)}%\`;
  meter.appendChild(fill);
  board.appendChild(meter);

  const actions = $("#actions");
  actions.innerHTML = "";
  for (const a of getLegalActions(state)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label(a);
    btn.addEventListener("click", () => {
      audio.play(a === "special" || a === "fire" || a === "fight" ? "hit" : "click");
      state = applyAction(state, a);
      render();
      void persist();
    });
    actions.appendChild(btn);
  }
  if (outcome !== "playing") {
    const again = document.createElement("button");
    again.type = "button";
    again.className = "primary";
    again.textContent = outcome === "won" ? "再來一局（勝）" : "再試一次";
    again.addEventListener("click", () => {
      audio.play("ok");
      state = createGame({ seed: Date.now() % 9999 });
      render();
    });
    actions.appendChild(again);
  }
  $("#badge").textContent = outcome === "playing" ? "進行中" : outcome === "won" ? "勝利" : "結束";
}

function clampMeter(view) {
  if (typeof view.meter === "number") return Math.max(0, Math.min(100, view.meter));
  if (typeof view.progress === "number") return view.progress;
  if (typeof view.score === "number") return Math.min(100, view.score);
  return 10;
}

async function persist() {
  const outcome = getOutcome(state);
  const view = summarize(state);
  progress = {
    ...progress,
    bestScore: Math.max(progress.bestScore || 0, view.score || 0),
    wins: (progress.wins || 0) + (outcome === "won" ? 1 : 0),
    last: view,
  };
  $("#best").textContent = String(progress.bestScore || 0);
  if (outcome === "won" || outcome === "lost") await saveProgress(progress);
}

async function boot() {
  progress = await loadProgress();
  $("#best").textContent = String(progress.bestScore || 0);
  $("#title").textContent = ${JSON.stringify(g.title)};
  $("#blurb").textContent = ${JSON.stringify(g.blurb)};
  $("#genre").textContent = ${JSON.stringify(g.genre)};
  $("#sound").addEventListener("click", async () => {
    const on = $("#sound").getAttribute("aria-pressed") !== "true";
    $("#sound").setAttribute("aria-pressed", String(on));
    $("#sound").textContent = on ? "♪ 音樂開" : "♪ 靜音";
    audio.setEnabled(on);
    if (on) await audio.start();
  });
  $("#start").addEventListener("click", async () => {
    await audio.start();
    audio.play("ok");
    $("#lobby").hidden = true;
    $("#game").hidden = false;
    render();
  });
}

boot();
`;
}

export function buildHtml(g) {
  const t = theme(g);
  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
    <meta name="theme-color" content="${t.bg}" />
    <meta name="description" content="${g.blurb}" />
    <title>${g.title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div class="glow" aria-hidden="true"></div>
    <main>
      <header class="top">
        <div>
          <p class="eyebrow" id="genre">${g.genre}</p>
          <h1 id="title">${g.title}</h1>
        </div>
        <button id="sound" class="icon" type="button" aria-pressed="true">♪ 音樂開</button>
      </header>

      <section id="lobby" class="panel">
        <img class="hero-art" src="./assets/images/hero.png" alt="" width="120" height="120" />
        <p id="blurb">${g.blurb}</p>
        <p class="meta">本機最佳分 <strong id="best">0</strong></p>
        <button id="start" class="primary" type="button">開始</button>
        <p class="fine"><a href="./ATTRIBUTION.md">署名</a></p>
      </section>

      <section id="game" hidden>
        <div class="status">
          <span id="badge">進行中</span>
          <p id="hud"></p>
        </div>
        <div id="board" class="board" aria-hidden="true"></div>
        <p id="msg" class="msg" aria-live="polite"></p>
        <pre id="extra" class="extra"></pre>
        <div id="actions" class="actions"></div>
      </section>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`;
}

export function buildCss(g) {
  const t = theme(g);
  return `:root {
  --bg: ${t.bg};
  --accent: ${t.accent};
  --panel: ${t.panel};
  --text: #f8f5f0;
  --muted: #c8c0b4;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  font-family: "Segoe UI", "PingFang TC", "Noto Sans TC", sans-serif;
  color: var(--text);
  background:
    radial-gradient(1200px 600px at 10% -10%, color-mix(in oklab, var(--accent) 35%, transparent), transparent),
    radial-gradient(900px 500px at 100% 0%, color-mix(in oklab, var(--accent) 18%, transparent), transparent),
    var(--bg);
}
.glow { position: fixed; inset: auto -20% -10% auto; width: 60vw; height: 40vh; background: color-mix(in oklab, var(--accent) 12%, transparent); filter: blur(40px); pointer-events: none; }
main { width: min(640px, 100%); margin: 0 auto; padding: 1rem 1rem 2.5rem; }
.top { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
.eyebrow { margin: 0; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); font-size: 0.75rem; }
h1 { margin: 0.2rem 0 0; font-size: clamp(1.6rem, 5vw, 2.1rem); line-height: 1.15; }
.icon, .actions button, .primary {
  min-height: 44px; min-width: 44px; border-radius: 12px; border: 1px solid color-mix(in oklab, var(--accent) 40%, #fff);
  background: color-mix(in oklab, var(--panel) 90%, #000); color: var(--text); font: inherit; padding: 0.65rem 0.9rem;
}
.primary { background: var(--accent); color: #1a1008; font-weight: 700; border: none; width: 100%; }
.panel { margin-top: 1rem; padding: 1.1rem; border-radius: 18px; background: color-mix(in oklab, var(--panel) 92%, #000); box-shadow: 0 12px 40px #0006; }
.hero-art { width: 120px; height: 120px; object-fit: contain; image-rendering: pixelated; display: block; margin: 0 auto 0.8rem; filter: drop-shadow(0 8px 16px #0008); }
.meta, .fine { color: var(--muted); }
.fine a { color: var(--accent); }
.status { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: baseline; margin: 0.5rem 0 0.8rem; }
#badge { background: var(--accent); color: #111; font-weight: 700; border-radius: 999px; padding: 0.25rem 0.7rem; font-size: 0.8rem; }
#hud { margin: 0; color: var(--muted); font-size: 0.9rem; }
.board {
  position: relative; height: 160px; border-radius: 16px; overflow: hidden;
  background:
    linear-gradient(180deg, transparent, #0005),
    repeating-linear-gradient(90deg, #fff1 0 2px, transparent 2px 24px),
    color-mix(in oklab, var(--panel) 80%, #000);
  border: 1px solid #ffffff1a;
}
.sprite { position: absolute; bottom: 12px; height: 96px; width: auto; image-rendering: pixelated; }
.hero { left: 12%; }
.rival { right: 12%; transform: scaleX(-1); }
.meter { position: absolute; left: 10%; right: 10%; bottom: 6px; height: 8px; background: #0006; border-radius: 99px; overflow: hidden; }
.meter > i { display: block; height: 100%; background: var(--accent); width: 10%; }
.msg { font-size: 1.05rem; min-height: 1.5em; }
.extra { white-space: pre-wrap; color: var(--muted); font-size: 0.8rem; background: #0003; padding: 0.6rem 0.8rem; border-radius: 10px; }
.actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; margin-top: 0.8rem; }
@media (min-width: 560px) {
  .actions { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .board { height: 200px; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`;
}

export function buildTest(g) {
  return `import { describe, expect, it } from "vitest";
import { createGame, applyAction, getLegalActions, getOutcome, summarize } from "./game.js";

describe("${g.id}", () => {
  it("creates a playable state with legal actions", () => {
    const s = createGame({ seed: 42 });
    expect(getOutcome(s)).toBe("playing");
    const acts = getLegalActions(s);
    expect(acts.length).toBeGreaterThan(0);
    expect(summarize(s)).toBeTruthy();
  });

  it("applyAction advances without throwing", () => {
    let s = createGame({ seed: 7 });
    for (let i = 0; i < 12; i++) {
      const acts = getLegalActions(s);
      if (!acts.length) break;
      s = applyAction(s, acts[i % acts.length]);
      expect(s).toBeTruthy();
    }
    expect(["playing", "won", "lost"]).toContain(getOutcome(s));
  });
});
`;
}
