import {
  applyEnginePresence,
  cacheEngineSnapshot,
  type BoothAnchorRecord,
} from "./boothAnchorState.js";

export type BoothAnchorWsEffect =
  | { type: "pong" }
  | { type: "broadcastOperators"; text: string; exceptSocketId?: string }
  | { type: "forwardToEngine"; text: string }
  | { type: "notifyEngineOperatorLeft" }
  | { type: "boothJoinAnswer"; joinId: string; answerWire: string };

export type BoothAnchorWsResult = {
  rec: BoothAnchorRecord;
  needsSave: boolean;
  effects: BoothAnchorWsEffect[];
};

export function handleBoothAnchorWsFrame(input: {
  role: string;
  socketId: string;
  frame: Record<string, unknown>;
  text: string;
  rec: BoothAnchorRecord;
  now: number;
}): BoothAnchorWsResult {
  const { role, socketId, frame, text, rec, now } = input;
  const effects: BoothAnchorWsEffect[] = [];
  let needsSave = false;

  if (role === "engine") {
    if (frame.type === "anchor.heartbeat") {
      const guestCount =
        typeof frame.guestCount === "number" ? frame.guestCount : undefined;
      applyEnginePresence(rec, guestCount, now);
      if (typeof guestCount === "number") needsSave = true;
      effects.push({ type: "pong" });
      return { rec, needsSave, effects };
    }

    if (frame.type === "booth.join.answer") {
      const joinId = typeof frame.joinId === "string" ? frame.joinId : "";
      const answerWire =
        typeof frame.answerWire === "string" ? frame.answerWire : "";
      if (joinId && answerWire) {
        effects.push({ type: "boothJoinAnswer", joinId, answerWire });
      }
      return { rec, needsSave, effects };
    }

    if (typeof frame.type === "string" && frame.type.startsWith("booth.")) {
      if (frame.type === "booth.state.snapshot") {
        cacheEngineSnapshot(rec, frame);
        needsSave = true;
      }
      effects.push({ type: "broadcastOperators", text, exceptSocketId: socketId });
      return { rec, needsSave, effects };
    }

    if (frame.type === "anchor.signal") {
      effects.push({ type: "broadcastOperators", text, exceptSocketId: socketId });
      return { rec, needsSave, effects };
    }

    return { rec, needsSave, effects };
  }

  if (role === "operator") {
    if (typeof frame.type === "string" && frame.type.startsWith("booth.")) {
      effects.push({ type: "forwardToEngine", text });
      return { rec, needsSave, effects };
    }
    if (frame.type === "anchor.signal") {
      effects.push({ type: "forwardToEngine", text });
    }
  }

  return { rec, needsSave, effects };
}
