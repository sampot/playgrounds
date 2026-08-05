import { describe, expect, it } from "vitest";
import {
  BRAINSTORM_PROTOCOL_API_VERSION,
  BRAINSTORM_PROTOCOL_ID,
  BRAINSTORM_STATE_KEY,
} from "./brainstormSessionApi";
import {
  createSessionHostStarterFiles,
  SESSION_HOST_STARTER_NAME,
} from "./sessionHostStarter";
import {
  createSessionParticipantStarterFiles,
  SESSION_PARTICIPANT_STARTER_NAME,
} from "./sessionParticipantStarter";

describe("session dogfood starters", () => {
  it("host starter is KV-backed brainstorm protocol", () => {
    const files = createSessionHostStarterFiles();
    expect(SESSION_HOST_STARTER_NAME).toBeTruthy();
    const fn = files["functions.js"] as string;
    expect(fn).toContain(BRAINSTORM_PROTOCOL_ID);
    expect(fn).toContain(BRAINSTORM_PROTOCOL_API_VERSION);
    expect(fn).toContain(BRAINSTORM_STATE_KEY);
    expect(fn).toContain("/api/session/meta");
    expect(fn).toContain("/api/session/open");
    expect(fn).toContain("/api/session/act");
    expect(fn).toContain("env.KV");
    expect(files["app.js"]).toContain("BroadcastChannel");
    expect(files["app.js"]).toContain("/api/session/act");
    expect(files["app.js"]).toContain("/api/shell/session");
    expect(files["app.js"]).toContain("spawn-participant");
    expect(files["app.js"]).toContain("invite-roster");
    expect(files["index.html"]).toContain("開始這一場");
    expect(files["index.html"]).toContain("邀請化身入座");
  });

  it("participant starter uses SESSION without LLM", () => {
    const files = createSessionParticipantStarterFiles();
    expect(SESSION_PARTICIPANT_STARTER_NAME).toBeTruthy();
    const fn = files["functions.js"] as string;
    expect(fn).toContain("env.SESSION");
    expect(fn).toContain("getEventChannel");
    expect(fn).toContain("session_inactive");
    expect(fn).toContain("ready: false");
    expect(fn).not.toContain("openai");
    expect(fn).not.toContain("groq");
    expect(fn).not.toContain("agent-a");
    expect(files["app.js"]).toContain("BroadcastChannel");
    expect(files["app.js"]).toContain(BRAINSTORM_PROTOCOL_ID);
    expect(files["app.js"]).toContain("isRetryable");
    expect(files["app.js"]).toContain("待機");
    expect(files["app.js"]).toContain("主持沙盒");
    expect(files["app.js"]).not.toContain("agent-b");
    const ctrl = files["controller.js"] as string;
    expect(ctrl).toContain("onMessage");
    expect(ctrl).toContain("session.event");
  });
});
