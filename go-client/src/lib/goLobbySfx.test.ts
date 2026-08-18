import { describe, expect, it, vi } from "vitest";
import {
  createLobbySfxPlayer,
  lobbyCabinetAttractTones,
  lobbyInteractTones,
  lobbyStepTones,
  playTone,
  shouldPlayCabinetAttract,
  shouldPlayFootstep,
  type MinimalAudioContext,
} from "./goLobbySfx";

describe("shouldPlayFootstep", () => {
  it("plays on the planted walk frames", () => {
    expect(shouldPlayFootstep(0, 1, true, true)).toBe(true);
    expect(shouldPlayFootstep(2, 3, true, true)).toBe(true);
  });

  it("plays on the first step when walking starts", () => {
    expect(shouldPlayFootstep(0, 0, true, false)).toBe(true);
  });

  it("is silent when idle or mid-stride", () => {
    expect(shouldPlayFootstep(0, 0, true, true)).toBe(false);
    expect(shouldPlayFootstep(1, 2, true, true)).toBe(false);
    expect(shouldPlayFootstep(0, 1, false, true)).toBe(false);
  });
});

describe("shouldPlayCabinetAttract", () => {
  it("chirps once when walking up to a new machine", () => {
    expect(
      shouldPlayCabinetAttract({
        prevIndex: null,
        nextIndex: 1,
        sfxEnabled: true,
        reducedMotion: false,
      })
    ).toBe(true);
    expect(
      shouldPlayCabinetAttract({
        prevIndex: 1,
        nextIndex: 1,
        sfxEnabled: true,
        reducedMotion: false,
      })
    ).toBe(false);
  });

  it("stays quiet when muted, reduced-motion, or walking away", () => {
    const approaching = {
      prevIndex: null,
      nextIndex: 0,
      sfxEnabled: true,
      reducedMotion: false,
    };
    expect(shouldPlayCabinetAttract({ ...approaching, sfxEnabled: false })).toBe(
      false
    );
    expect(
      shouldPlayCabinetAttract({ ...approaching, reducedMotion: true })
    ).toBe(false);
    expect(
      shouldPlayCabinetAttract({
        prevIndex: 0,
        nextIndex: null,
        sfxEnabled: true,
        reducedMotion: false,
      })
    ).toBe(false);
  });
});

describe("lobby tone recipes", () => {
  it("uses a short low step blip", () => {
    const tones = lobbyStepTones(0);
    expect(tones.some((t) => t.gain >= 0.12)).toBe(true);
    expect(Math.max(...tones.map((t) => t.freq))).toBeGreaterThan(250);
    expect(lobbyStepTones(1)[0]!.freq).not.toBe(tones[0]!.freq);
  });

  it("gives each interactable a distinct pitch set", () => {
    const boss = lobbyInteractTones("boss").map((t) => t.freq).join(",");
    const cabinet = lobbyInteractTones("cabinet").map((t) => t.freq).join(",");
    const chat = lobbyInteractTones("chat").map((t) => t.freq).join(",");
    expect(new Set([boss, cabinet, chat]).size).toBe(3);
    expect(lobbyInteractTones("cabinet").length).toBeGreaterThan(1);
    const attract = lobbyCabinetAttractTones();
    expect(Math.max(...attract.map((t) => t.gain))).toBeLessThan(0.05);
  });
});

function mockAudio(): {
  ctx: MinimalAudioContext;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  const start = vi.fn();
  const stop = vi.fn();
  const param = () => ({
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  });
  const ctx: MinimalAudioContext = {
    currentTime: 0.5,
    state: "running",
    destination: {},
    resume: vi.fn(async () => {}),
    createOscillator() {
      return {
        type: "sine",
        frequency: param(),
        connect: vi.fn(),
        start,
        stop,
      };
    },
    createGain() {
      return {
        gain: param(),
        connect: vi.fn(),
      };
    },
  };
  return { ctx, start, stop };
}

describe("playTone", () => {
  it("starts and stops an oscillator", () => {
    const { ctx, start, stop } = mockAudio();
    playTone(ctx, lobbyStepTones(0)[0]!);
    expect(start).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });
});

describe("createLobbySfxPlayer", () => {
  it("plays a step unless reduced motion is on", () => {
    const a = mockAudio();
    const player = createLobbySfxPlayer({
      createContext: () => a.ctx,
      reducedMotion: () => false,
    });
    player.playStep(0);
    expect(a.start).toHaveBeenCalled();

    const b = mockAudio();
    const quiet = createLobbySfxPlayer({
      createContext: () => b.ctx,
      reducedMotion: () => true,
    });
    quiet.playStep(0);
    expect(b.start).not.toHaveBeenCalled();
  });

  it("plays interact even when reduced motion is on", () => {
    const { ctx, start } = mockAudio();
    const player = createLobbySfxPlayer({
      createContext: () => ctx,
      reducedMotion: () => true,
    });
    player.playInteract("cabinet");
    expect(start).toHaveBeenCalled();
  });

  it("defaults sound on and persists mute", () => {
    let stored: string | null = null;
    const storage = {
      getItem: () => stored,
      setItem: (_k: string, v: string) => {
        stored = v;
      },
    };
    const { ctx, start } = mockAudio();
    const player = createLobbySfxPlayer({
      createContext: () => ctx,
      storage,
    });
    expect(player.isEnabled()).toBe(true);
    expect(player.toggleEnabled()).toBe(false);
    expect(stored).toBe("off");
    start.mockClear();
    player.playStep(0);
    player.playInteract("cabinet");
    player.playAttract();
    expect(start).not.toHaveBeenCalled();
    expect(player.toggleEnabled()).toBe(true);
    expect(stored).toBe("on");
  });
});
