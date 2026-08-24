import { describe, expect, it } from "vitest";
import {
  applyRecordNotify,
  createPresenceRecordHub,
  formatRecordFileName,
  peerHasRecordableLive,
  resolveRecordTargetPeer,
} from "./goRoomPresenceRecord";
import { buildSessionRecordMessage } from "@pg/roster/rosterSessionRecord";
import type { RoomPrivateLibrary } from "./goRoomPrivateTypes";

describe("goRoomPresenceRecord helpers", () => {
  it("resolves local peer ids to the host agent id", () => {
    expect(resolveRecordTargetPeer("local", "host-1")).toBe("host-1");
    expect(resolveRecordTargetPeer("", "host-1")).toBe("host-1");
    expect(resolveRecordTargetPeer("g-a", "host-1")).toBe("g-a");
  });

  it("requires camera for recordable live in v1", () => {
    expect(peerHasRecordableLive({ camera: true, mic: false })).toBe(true);
    expect(peerHasRecordableLive({ camera: false, mic: true })).toBe(false);
  });

  it("formats private library file names", () => {
    expect(
      formatRecordFileName({
        displayName: "小明",
        label: "臥室",
        now: new Date("2026-08-23T10:15:30+08:00"),
      })
    ).toBe("臥室-小明-20260823-101530.webm");
  });

  it("tracks notify fanout for guest badges", () => {
    let set = new Set<string>();
    set = applyRecordNotify(
      set,
      buildSessionRecordMessage({
        op: "notify",
        from: "host-1",
        targetPeer: "g-a",
        active: true,
      })
    );
    expect([...set]).toEqual(["g-a"]);
    set = applyRecordNotify(
      set,
      buildSessionRecordMessage({
        op: "notify",
        from: "host-1",
        targetPeer: "g-a",
        active: false,
      })
    );
    expect(set.size).toBe(0);
  });
});

describe("createPresenceRecordHub", () => {
  it("starts and stops a recording into private storage", async () => {
    const sent: unknown[] = [];
    class FakeRecorder {
      static isTypeSupported = () => true;
      state = "inactive";
      ondataavailable: ((ev: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(_stream: MediaStream, _opts: { mimeType: string }) {}
      start() {
        this.state = "recording";
        this.ondataavailable?.({ data: new Blob([1, 2, 3]) });
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob([4]) });
        this.onstop?.();
      }
    }
    const tracks = [
      { kind: "video", enabled: true, readyState: "live" },
    ] as unknown as MediaStreamTrack[];
    const stream = {
      getVideoTracks: () => tracks,
      getAudioTracks: () => [],
    } as MediaStream;

    const writerChunks: number[] = [];
    const privateLibrary = {
      supported: true,
      list: async () => [],
      importFile: async () => ({ ok: false, error: "n/a" }) as const,
      getFile: async () => null,
      remove: async () => {},
      clear: async () => {},
      async openStreamWrite(opts: { name: string; mime: string }) {
        const id = "pvt_rec1";
        let size = 0;
        return {
          ok: true as const,
          writer: {
            id,
            async writeChunk(chunk: Blob) {
              size += chunk.size;
              writerChunks.push(chunk.size);
            },
            async finalize() {
              return {
                ok: true as const,
                entry: {
                  id,
                  name: opts.name,
                  mime: opts.mime,
                  size,
                  createdAt: 1,
                },
              };
            },
            async abort() {},
          },
        };
      },
    } satisfies RoomPrivateLibrary;

    const hub = createPresenceRecordHub({
      localAgentId: "host-1",
      privateLibrary,
      getLive: (peerId) =>
        peerId === "g-a" ? { camera: true, mic: true } : null,
      getPresenceStream: (peerId) => (peerId === "g-a" ? stream : null),
      sendJson: (msg) => {
        sent.push(msg);
      },
      MediaRecorder: FakeRecorder as unknown as typeof MediaRecorder,
      now: () => 1000,
    });

    const start = await hub.start("g-a", "小明");
    expect(start.ok).toBe(true);
    expect(hub.recordingPeerIds()).toEqual(["g-a"]);

    const stop = await hub.stop("g-a");
    expect(stop.ok).toBe(true);
    expect(hub.recordingPeerIds()).toEqual([]);
    expect(writerChunks).toEqual([3, 1]);
    expect(sent.some((m) => (m as { op?: string }).op === "done")).toBe(true);
  });
});
