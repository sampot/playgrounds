import { describe, expect, it, vi } from "vitest";
import {
  createPresenceAudioMixer,
  resolvePresenceSendTrack,
  type AudioContextLike,
} from "./goRoomPresenceAudioMix";

function track(id: string) {
  return {
    kind: "audio" as const,
    id,
    readyState: "live" as const,
    enabled: true,
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function fakeContext(mixedId = "mixed") {
  const mixed = track(mixedId);
  const connects: MediaStreamTrack[] = [];
  const ctx: AudioContextLike = {
    createMediaStreamSource(stream) {
      const t = stream.getAudioTracks()[0];
      if (t) connects.push(t);
      return {
        connect() {},
      };
    },
    createMediaStreamDestination() {
      return {
        stream: {
          getAudioTracks: () => [mixed],
        } as unknown as MediaStream,
      };
    },
    resume: vi.fn(async () => {}),
    close: vi.fn(),
  };
  return { ctx, mixed, connects };
}

describe("resolvePresenceSendTrack", () => {
  it("returns null when there are no tracks", () => {
    expect(resolvePresenceSendTrack([], () => track("x"))).toBeNull();
  });

  it("returns the sole track without mixing", () => {
    const a = track("a");
    const mix = vi.fn(() => track("mixed"));
    expect(resolvePresenceSendTrack([a], mix)).toBe(a);
    expect(mix).not.toHaveBeenCalled();
  });

  it("mixes when there are two or more tracks", () => {
    const a = track("a");
    const b = track("b");
    const mixed = track("mixed");
    const mix = vi.fn(() => mixed);
    expect(resolvePresenceSendTrack([a, b], mix)).toBe(mixed);
    expect(mix).toHaveBeenCalledWith([a, b]);
  });
});

describe("createPresenceAudioMixer", () => {
  it("forwards a single source without opening AudioContext", () => {
    const createContext = vi.fn(() => fakeContext().ctx);
    const mixer = createPresenceAudioMixer({ createContext });
    const a = track("a-mic");
    mixer.setSources([{ peerId: "g-a", track: a }]);
    expect(mixer.trackFor("g-b")).toBe(a);
    expect(mixer.trackFor("g-a")).toBeNull();
    expect(createContext).not.toHaveBeenCalled();
    mixer.close();
  });

  it("mixes two remotes for a third peer and excludes self", () => {
    const { ctx, mixed, connects } = fakeContext("mix-ab");
    const createContext = vi.fn(() => ctx);
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
      getAudioTracks() {
        return this.tracks;
      }
    }
    const mixer = createPresenceAudioMixer({
      createContext,
      createMediaStream: (tracks) =>
        new FakeStream(tracks) as unknown as MediaStream,
    });
    const a = track("a");
    const b = track("b");
    const host = track("host");
    mixer.setSources([
      { peerId: "host", track: host },
      { peerId: "g-a", track: a },
      { peerId: "g-b", track: b },
    ]);
    expect(mixer.trackFor("g-a")).toBe(mixed);
    expect(connects.map((t) => t.id).sort()).toEqual(["b", "host"]);
    expect(mixer.localListenTrack("host")).toBe(mixed);
    mixer.close();
    expect(ctx.close).toHaveBeenCalled();
  });

  it("sends only the other mic when two guests are open and host is quiet", () => {
    const createContext = vi.fn(() => fakeContext().ctx);
    const mixer = createPresenceAudioMixer({ createContext });
    const a = track("a");
    const b = track("b");
    mixer.setSources([
      { peerId: "g-a", track: a },
      { peerId: "g-b", track: b },
    ]);
    expect(mixer.trackFor("g-a")).toBe(b);
    expect(mixer.trackFor("g-b")).toBe(a);
    expect(createContext).not.toHaveBeenCalled();
    mixer.close();
  });
});
