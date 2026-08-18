import type { ShopHotspotId } from "./goShopHotspots";

export type AudioParamLike = {
  setValueAtTime: (value: number, time: number) => void;
  exponentialRampToValueAtTime: (value: number, time: number) => void;
  linearRampToValueAtTime?: (value: number, time: number) => void;
};

export type OscillatorLike = {
  type: OscillatorType;
  frequency: AudioParamLike;
  connect: (node: unknown) => void;
  start: (when?: number) => void;
  stop: (when?: number) => void;
};

export type GainLike = {
  gain: AudioParamLike;
  connect: (node: unknown) => void;
};

export type MinimalAudioContext = {
  currentTime: number;
  state?: string;
  destination: unknown;
  resume?: () => Promise<void>;
  createOscillator: () => OscillatorLike;
  createGain: () => GainLike;
};

export type OscTone = {
  type: OscillatorType;
  freq: number;
  freqEnd?: number;
  durationMs: number;
  gain: number;
  delayMs?: number;
};

/** Foot-down frames in the 4-step walk cycle, plus the first step when walking starts. */
export function shouldPlayFootstep(
  prevFrame: number,
  nextFrame: number,
  walking: boolean,
  wasWalking: boolean = true
): boolean {
  if (!walking) return false;
  if (!wasWalking) return true;
  if (prevFrame === nextFrame) return false;
  return nextFrame === 1 || nextFrame === 3;
}

export function lobbyStepTones(stepIndex: number): OscTone[] {
  const left = stepIndex % 2 === 0;
  return [
    {
      type: "square",
      freq: left ? 150 : 128,
      freqEnd: 68,
      durationMs: 72,
      gain: 0.18,
    },
    {
      type: "square",
      freq: left ? 430 : 390,
      freqEnd: 210,
      durationMs: 42,
      gain: 0.12,
    },
  ];
}

export function lobbyStepTone(stepIndex: number): OscTone {
  return lobbyStepTones(stepIndex)[0]!;
}

export function lobbyCabinetAttractTones(): OscTone[] {
  return [
    { type: "square", freq: 988, durationMs: 40, gain: 0.028 },
    { type: "triangle", freq: 784, durationMs: 70, gain: 0.02, delayMs: 30 },
  ];
}

export function shouldPlayCabinetAttract(args: {
  prevIndex: number | null;
  nextIndex: number | null;
  sfxEnabled: boolean;
  reducedMotion: boolean;
}): boolean {
  if (!args.sfxEnabled || args.reducedMotion) return false;
  if (args.nextIndex == null) return false;
  return args.nextIndex !== args.prevIndex;
}

export function lobbyInteractTones(id: ShopHotspotId): OscTone[] {
  switch (id) {
    case "boss":
      return [
        { type: "square", freq: 392, durationMs: 90, gain: 0.06 },
        { type: "square", freq: 523, durationMs: 110, gain: 0.05, delayMs: 70 },
      ];
    case "cabinet":
      return [
        { type: "square", freq: 880, durationMs: 70, gain: 0.07 },
        { type: "square", freq: 1320, durationMs: 90, gain: 0.045, delayMs: 55 },
      ];
    case "chat":
      return [
        { type: "sine", freq: 440, durationMs: 90, gain: 0.05 },
        { type: "triangle", freq: 660, durationMs: 130, gain: 0.035, delayMs: 70 },
      ];
    case "bulletin":
      return [{ type: "triangle", freq: 330, freqEnd: 220, durationMs: 80, gain: 0.05 }];
    case "storage":
      return [
        { type: "triangle", freq: 196, durationMs: 90, gain: 0.07 },
        { type: "triangle", freq: 262, durationMs: 110, gain: 0.05, delayMs: 85 },
      ];
    case "sfx":
      return [{ type: "square", freq: 660, durationMs: 70, gain: 0.08 }];
  }
}

export function playTone(ctx: MinimalAudioContext, tone: OscTone): void {
  const t0 = ctx.currentTime + (tone.delayMs ?? 0) / 1000;
  const dur = Math.max(0.02, tone.durationMs / 1000);
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.freq, t0);
  if (tone.freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.freqEnd), t0 + dur);
  }
  amp.gain.setValueAtTime(0.0001, t0);
  const attack = Math.min(0.004, dur * 0.12);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, tone.gain), t0 + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const LOBBY_SFX_STORAGE_KEY = "pg_go_lobby_sfx";

export function readLobbySfxEnabled(
  storage: Pick<Storage, "getItem"> | null | undefined
): boolean {
  if (!storage) return true;
  return storage.getItem(LOBBY_SFX_STORAGE_KEY) !== "off";
}

export function writeLobbySfxEnabled(
  storage: Pick<Storage, "setItem">,
  enabled: boolean
): void {
  storage.setItem(LOBBY_SFX_STORAGE_KEY, enabled ? "on" : "off");
}

export type LobbySfxPlayer = {
  unlock: () => void;
  isEnabled: () => boolean;
  toggleEnabled: () => boolean;
  playStep: (stepIndex?: number) => void;
  playInteract: (id: ShopHotspotId) => void;
  playAttract: () => void;
};

export function createLobbySfxPlayer(args: {
  createContext: () => MinimalAudioContext | null;
  reducedMotion?: () => boolean;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
}): LobbySfxPlayer {
  let ctx: MinimalAudioContext | null | undefined;
  let steps = 0;
  let enabled = readLobbySfxEnabled(args.storage);

  function ensure(): MinimalAudioContext | null {
    if (ctx === undefined) ctx = args.createContext();
    if (ctx?.state === "suspended" && ctx.resume) void ctx.resume();
    return ctx ?? null;
  }

  function playTones(tones: OscTone[]) {
    const audio = ensure();
    if (!audio) return;
    for (const tone of tones) playTone(audio, tone);
  }

  return {
    unlock() {
      ensure();
    },
    isEnabled() {
      return enabled;
    },
    toggleEnabled() {
      if (enabled) {
        playTones([{ type: "triangle", freq: 220, freqEnd: 110, durationMs: 90, gain: 0.1 }]);
        enabled = false;
      } else {
        enabled = true;
        playTones([
          { type: "square", freq: 523, durationMs: 70, gain: 0.08 },
          { type: "square", freq: 784, durationMs: 90, gain: 0.06, delayMs: 55 },
        ]);
      }
      if (args.storage) writeLobbySfxEnabled(args.storage, enabled);
      return enabled;
    },
    playStep(stepIndex?: number) {
      if (!enabled || args.reducedMotion?.()) return;
      const n = stepIndex ?? steps;
      steps += 1;
      playTones(lobbyStepTones(n));
    },
    playInteract(id: ShopHotspotId) {
      if (!enabled) return;
      playTones(lobbyInteractTones(id));
    },
    playAttract() {
      if (!enabled || args.reducedMotion?.()) return;
      playTones(lobbyCabinetAttractTones());
    },
  };
}

type AudioContextCtor = new () => AudioContext;

let sharedBrowserCtx: AudioContext | null = null;

export function browserAudioContextFactory(): () => MinimalAudioContext | null {
  return () => {
    const w = globalThis as typeof globalThis & {
      AudioContext?: AudioContextCtor;
      webkitAudioContext?: AudioContextCtor;
    };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) return null;
    if (!sharedBrowserCtx) sharedBrowserCtx = new AC();
    return sharedBrowserCtx as unknown as MinimalAudioContext;
  };
}

let defaultPlayer: LobbySfxPlayer | null = null;

/** Shared player so canvas, bump, and hotspot nav use one AudioContext. */
export function getLobbySfxPlayer(): LobbySfxPlayer {
  if (!defaultPlayer) {
    defaultPlayer = createLobbySfxPlayer({
      createContext: browserAudioContextFactory(),
      reducedMotion: () =>
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      storage: typeof localStorage === "undefined" ? null : localStorage,
    });
  }
  return defaultPlayer;
}
