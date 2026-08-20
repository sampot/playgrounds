/**
 * Star-hub presence audio: mix open mics into one outbound track per peer
 * (exclude that peer's own uplink). See PG-GO-ROOM-PLAN §9.8.1.
 */

export type PresenceAudioSource = {
  /** `localAgentId` for the host mic; guest peerId otherwise. */
  peerId: string;
  track: MediaStreamTrack;
};

export type AudioContextLike = {
  createMediaStreamSource(stream: MediaStream): { connect(dest: unknown): void };
  createMediaStreamDestination(): {
    stream: MediaStream;
  };
  resume?: () => Promise<void>;
  close?: () => Promise<void> | void;
  state?: string;
};

export type PresenceAudioMixer = {
  setSources(sources: PresenceAudioSource[]): void;
  /** Outbound presence audio for `destPeerId` (excludes their uplink). */
  trackFor(destPeerId: string): MediaStreamTrack | null;
  /** Host-local listen mix of remote mics only. */
  localListenTrack(localAgentId: string): MediaStreamTrack | null;
  close(): void;
};

function sourceKey(sources: PresenceAudioSource[]): string {
  return sources
    .map((s) => `${s.peerId}:${s.track.id}`)
    .sort()
    .join("|");
}

function tracksExcluding(
  sources: PresenceAudioSource[],
  excludePeerId: string | null
): MediaStreamTrack[] {
  return sources
    .filter((s) => (excludePeerId == null ? true : s.peerId !== excludePeerId))
    .map((s) => s.track);
}

/**
 * Pick a send track: 0 → null; 1 → that track; 2+ → mixed via Web Audio.
 */
export function resolvePresenceSendTrack(
  tracks: MediaStreamTrack[],
  mix: (parts: MediaStreamTrack[]) => MediaStreamTrack | null
): MediaStreamTrack | null {
  if (tracks.length === 0) return null;
  if (tracks.length === 1) return tracks[0]!;
  return mix(tracks);
}

export function createPresenceAudioMixer(opts?: {
  createContext?: () => AudioContextLike;
  createMediaStream?: (tracks: MediaStreamTrack[]) => MediaStream;
}): PresenceAudioMixer {
  const createContext =
    opts?.createContext ??
    (() => new AudioContext() as unknown as AudioContextLike);
  const createMediaStream =
    opts?.createMediaStream ??
    ((tracks: MediaStreamTrack[]) => new MediaStream(tracks));

  let sources: PresenceAudioSource[] = [];
  let ctx: AudioContextLike | null = null;
  /** Cache key → mixed outbound track (owned by ctx destinations). */
  const mixed = new Map<string, MediaStreamTrack>();

  function ensureCtx(): AudioContextLike | null {
    if (ctx) return ctx;
    try {
      ctx = createContext();
      void ctx.resume?.();
      return ctx;
    } catch {
      ctx = null;
      return null;
    }
  }

  function mixTracks(parts: MediaStreamTrack[]): MediaStreamTrack | null {
    const key = parts
      .map((t) => t.id)
      .sort()
      .join("+");
    const hit = mixed.get(key);
    if (hit && hit.readyState !== "ended") return hit;
    const ac = ensureCtx();
    if (!ac) return parts[0] ?? null;
    try {
      const dest = ac.createMediaStreamDestination();
      for (const t of parts) {
        const src = ac.createMediaStreamSource(createMediaStream([t]));
        src.connect(dest);
      }
      const out = dest.stream.getAudioTracks()[0] ?? null;
      if (out) mixed.set(key, out);
      return out;
    } catch {
      return parts[0] ?? null;
    }
  }

  function trackExcluding(excludePeerId: string | null): MediaStreamTrack | null {
    return resolvePresenceSendTrack(
      tracksExcluding(sources, excludePeerId),
      mixTracks
    );
  }

  return {
    setSources(next) {
      const nextKey = sourceKey(next);
      if (nextKey === sourceKey(sources)) return;
      sources = next.slice();
      mixed.clear();
      // Keep ctx; destinations are cheap to rebuild. Full close on close().
    },
    trackFor(destPeerId) {
      return trackExcluding(destPeerId);
    },
    localListenTrack(localAgentId) {
      return trackExcluding(localAgentId);
    },
    close() {
      sources = [];
      mixed.clear();
      const ac = ctx;
      ctx = null;
      try {
        void ac?.close?.();
      } catch {
        /* ignore */
      }
    },
  };
}
