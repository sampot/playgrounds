/**
 * 包廂大螢幕音檔 player 面＋本機節目音視覺化（PG-GO-ROOM-PLAN §5.7.1／2h）。
 *
 * Audio-face path: MediaStreamSource → Analyser → Gain → destination.
 * createMediaStreamSource can take the audible path away from `<video>`;
 * speakers must come from the GainNode, not el.muted／volume.
 */

export type RoomTvProgramAvKind = "audio" | "video";

/** Show the audio player face when an audio file is on the big screen. */
export function roomTvAudioPlayerFace(opts: {
  tvOn: boolean;
  playActive?: boolean;
  ownerDecodeKind?: RoomTvProgramAvKind | null;
  remoteProgramKind?: RoomTvProgramAvKind | null;
}): boolean {
  if (!opts.tvOn || opts.playActive) return false;
  return (
    opts.ownerDecodeKind === "audio" || opts.remoteProgramKind === "audio"
  );
}

export type RoomAudioVisualizerOpts = {
  /** 0 = muted／quiet sink; 1 = full. Scales bar heights. */
  gain?: number;
};

/** Match visualizer bounce to the local TV sink (muted → flat). */
export function roomAudioVisualizerGain(opts: {
  volume: number;
  muted: boolean;
}): number {
  if (opts.muted) return 0;
  if (!Number.isFinite(opts.volume) || opts.volume <= 0) return 0;
  return Math.min(1, opts.volume);
}

/**
 * Map analyser frequency bins → bar heights in 0..1.
 * Fewer bars than bins → average each slice.
 */
export function roomAudioVisualizerLevels(
  freq: ArrayLike<number>,
  barCount: number,
  opts?: RoomAudioVisualizerOpts
): number[] {
  const n = Math.floor(barCount);
  if (n <= 0) return [];
  const gain =
    opts?.gain == null || !Number.isFinite(opts.gain)
      ? 1
      : Math.min(1, Math.max(0, opts.gain));
  const len = freq.length;
  if (len === 0 || gain <= 0) return Array.from({ length: n }, () => 0);

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = Math.floor((i * len) / n);
    const end = Math.floor(((i + 1) * len) / n);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += freq[j] ?? 0;
      count++;
    }
    const avg = count > 0 ? sum / count : 0;
    out.push(Math.min(1, Math.max(0, (avg / 255) * gain)));
  }
  return out;
}

export type ProgramAudioAnalyserContext = {
  createMediaStreamSource(stream: MediaStream): { connect(node: unknown): void };
  createAnalyser(): {
    fftSize: number;
    frequencyBinCount: number;
    connect(node: unknown): void;
    getByteFrequencyData(array: Uint8Array): void;
  };
  createGain(): {
    gain: { value: number };
    connect(node: unknown): void;
  };
  destination: unknown;
  resume?: () => Promise<void>;
  close?: () => Promise<void> | void;
  state?: string;
};

export type ProgramAudioAnalyser = {
  levels(barCount: number, opts?: RoomAudioVisualizerOpts): number[];
  /** Local speaker level — drives GainNode (and visualizer gain). */
  setGain(opts: { volume: number; muted: boolean }): void;
  close(): void;
};

const IDLE_FFT = 256;

/**
 * Tap program MediaStream → Analyser (viz) + Gain → speakers.
 * Keep the TV `<video>` muted while this is open to avoid a silent element path.
 */
export function createProgramAudioAnalyser(opts: {
  stream: MediaStream | null;
  createContext?: () => ProgramAudioAnalyserContext;
}): ProgramAudioAnalyser | null {
  const stream = opts.stream;
  if (!stream) return null;
  const tracks =
    typeof stream.getAudioTracks === "function"
      ? stream.getAudioTracks()
      : [];
  if (!tracks.length) return null;

  const createContext =
    opts.createContext ??
    (() => new AudioContext() as unknown as ProgramAudioAnalyserContext);

  let ctx: ProgramAudioAnalyserContext | null = null;
  let analyser: ReturnType<ProgramAudioAnalyserContext["createAnalyser"]> | null =
    null;
  let gainNode: ReturnType<ProgramAudioAnalyserContext["createGain"]> | null =
    null;
  let closed = false;
  const buf = new Uint8Array(IDLE_FFT);

  try {
    ctx = createContext();
    void ctx.resume?.();
    analyser = ctx.createAnalyser();
    analyser.fftSize = IDLE_FFT;
    gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(ctx.destination);
  } catch {
    try {
      void ctx?.close?.();
    } catch {
      /* ignore */
    }
    return null;
  }

  return {
    levels(barCount, levelOpts) {
      if (closed || !analyser) {
        const n = Math.max(0, Math.floor(barCount));
        return Array.from({ length: n }, () => 0);
      }
      const need = analyser.frequencyBinCount;
      const data = buf.length === need ? buf : new Uint8Array(need);
      analyser.getByteFrequencyData(data);
      return roomAudioVisualizerLevels(data, barCount, levelOpts);
    },
    setGain(sink) {
      if (closed || !gainNode) return;
      const next = roomAudioVisualizerGain(sink);
      gainNode.gain.value = next;
      if (next > 0) void ctx?.resume?.();
    },
    close() {
      if (closed) return;
      closed = true;
      analyser = null;
      gainNode = null;
      try {
        void ctx?.close?.();
      } catch {
        /* ignore */
      }
      ctx = null;
    },
  };
}
