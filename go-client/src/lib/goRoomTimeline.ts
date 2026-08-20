/**
 * 包廂文字時間線：一般訊息卡片＋連動系統動態（進出／檔案／電視）.
 * Local-only notes — not a new DataChannel type; each peer derives from occupancy／catalog／TV.
 */

import { catalogConsumes, type CatalogItemLike } from "./goRoomCatalog";

export const ROOM_TIMELINE_MAX = 200;

export type RoomMentionPerson = {
  peerId: string;
  name: string;
};

export type RoomChatSegment =
  | { type: "text"; text: string }
  | { type: "mention"; text: string; peerId: string; name: string };

export type RoomSystemTone = "presence" | "file" | "tv";

export type RoomSystemFileRef = {
  id: string;
  name: string;
  preview: boolean;
  download: boolean;
};

export type RoomSystemNote = {
  id: string;
  ts: number;
  tone: RoomSystemTone;
  text: string;
  file?: RoomSystemFileRef;
};

export type RoomShareRow = {
  id: string;
  name: string;
  ownerName: string;
};

export type RoomTvCue =
  | { kind: "off" }
  | { kind: "live"; name: string }
  | { kind: "file"; name: string };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatRoomChatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function mentionNames(people: readonly RoomMentionPerson[]): RoomMentionPerson[] {
  return [...people]
    .filter((p) => p.name.trim())
    .sort((a, b) => b.name.length - a.name.length);
}

export function parseRoomChatSegments(
  text: string,
  people: readonly RoomMentionPerson[]
): RoomChatSegment[] {
  const ranked = mentionNames(people);
  const out: RoomChatSegment[] = [];
  let i = 0;
  let buf = "";
  while (i < text.length) {
    if (text[i] === "@") {
      const rest = text.slice(i + 1);
      const hit = ranked.find((p) => rest.startsWith(p.name));
      if (hit) {
        if (buf) {
          out.push({ type: "text", text: buf });
          buf = "";
        }
        out.push({
          type: "mention",
          text: `@${hit.name}`,
          peerId: hit.peerId,
          name: hit.name,
        });
        i += 1 + hit.name.length;
        continue;
      }
    }
    buf += text[i];
    i += 1;
  }
  if (buf) out.push({ type: "text", text: buf });
  return out.length > 0 ? out : [{ type: "text", text }];
}

export function roomChatMentionDraft(
  draft: string
): { start: number; query: string } | null {
  const at = draft.lastIndexOf("@");
  if (at < 0) return null;
  const after = draft.slice(at + 1);
  if (/\s/.test(after)) return null;
  return { start: at, query: after };
}

export function roomChatFilterMentionTargets(
  query: string,
  people: readonly RoomMentionPerson[]
): RoomMentionPerson[] {
  const q = query.trim().toLowerCase();
  return people.filter((p) => {
    const n = p.name.trim();
    if (!n) return false;
    if (!q) return true;
    return n.toLowerCase().includes(q);
  });
}

export function roomChatApplyMention(
  draft: string,
  start: number,
  person: { name: string }
): string {
  const name = person.name.trim();
  if (!name) return draft;
  return `${draft.slice(0, start)}@${name} `;
}

export function roomSystemJoinText(name: string): string {
  return `${name.trim() || "訪客"} 已加入包廂`;
}

export function roomSystemLeaveText(name: string): string {
  return `${name.trim() || "訪客"} 已離開包廂`;
}

export function roomSystemFileText(who: string, fileName: string): string {
  return `${who.trim() || "有人"} 上傳了 ${fileName.trim() || "一個檔"}`;
}

export function roomSystemTvLiveText(host: string, who: string): string {
  const actor = host.trim() || "主持人";
  const target = who.trim() || "成員";
  return `${actor} 已將 ${target}的鏡頭 推播至大電視`;
}

export function roomSystemTvFileText(host: string, fileName: string): string {
  const actor = host.trim() || "主持人";
  return `${actor} 已將 ${fileName.trim() || "片子"} 放到電視上`;
}

export function roomOccupancyChanges(
  prev: readonly RoomMentionPerson[] | null,
  next: readonly RoomMentionPerson[]
): { joined: RoomMentionPerson[]; left: RoomMentionPerson[] } {
  if (prev == null) return { joined: [], left: [] };
  const prevMap = new Map(prev.map((p) => [p.peerId, p]));
  const nextMap = new Map(next.map((p) => [p.peerId, p]));
  const joined: RoomMentionPerson[] = [];
  const left: RoomMentionPerson[] = [];
  for (const row of next) {
    if (!prevMap.has(row.peerId)) joined.push(row);
  }
  for (const row of prev) {
    if (!nextMap.has(row.peerId)) left.push(row);
  }
  return { joined, left };
}

export function roomShareCatalogChanges(
  prev: readonly RoomShareRow[] | null,
  next: readonly RoomShareRow[]
): RoomShareRow[] {
  if (prev == null) return [];
  const seen = new Set(prev.map((f) => f.id));
  return next.filter((f) => !seen.has(f.id));
}

export function roomSystemFileActions(
  item: CatalogItemLike & { mine?: boolean }
): {
  preview: boolean;
  download: boolean;
} {
  if (item.mine || item.kind === "dir" || item.kind === "device") {
    return { preview: false, download: false };
  }
  const acts = catalogConsumes(item);
  return {
    preview: true,
    download: acts.includes("download") || acts.length === 0,
  };
}

export function roomTvCue(opts: {
  tvSourcePeerId: string | null;
  programName: string | null;
  remoteProgramName: string | null;
  occupants: readonly RoomMentionPerson[];
}): RoomTvCue {
  const file =
    opts.remoteProgramName?.trim() || opts.programName?.trim() || "";
  const src = opts.tvSourcePeerId?.trim() || "";
  if (src) {
    const who =
      opts.occupants.find((p) => p.peerId === src)?.name.trim() ||
      (src === "local"
        ? opts.occupants.find((p) => p.peerId === "local")?.name.trim()
        : "") ||
      file ||
      "成員";
    return { kind: "live", name: who };
  }
  if (!file) return { kind: "off" };
  if (file === "鏡頭") return { kind: "live", name: "成員" };
  const byName = opts.occupants.find((p) => p.name.trim() === file);
  if (byName) return { kind: "live", name: byName.name };
  return { kind: "file", name: file };
}

export function roomTvCueChange(
  prev: RoomTvCue | null,
  next: RoomTvCue
): RoomTvCue | null {
  if (prev == null) return null;
  if (prev.kind === next.kind) {
    if (prev.kind === "off") return null;
    if (prev.kind === next.kind && prev.name === next.name) return null;
  }
  if (next.kind === "off") return null;
  return next;
}

let sysSeq = 0;

export function newRoomSystemId(prefix: string): string {
  sysSeq += 1;
  return `sys-${prefix}-${Date.now()}-${sysSeq}`;
}
