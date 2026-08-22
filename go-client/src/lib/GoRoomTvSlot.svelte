<script lang="ts">
  import {
    GO_ROOM_TV_EXIT_FULLSCREEN,
    GO_ROOM_TV_FULLSCREEN,
    GO_ROOM_TV_OFF_BTN,
    GO_ROOM_TV_PAUSE,
    GO_ROOM_TV_PLAY,
    GO_ROOM_TV_VOLUME,
    attachMediaStream,
    roomTvClockLabel,
    roomTvHudDefaultSink,
    roomTvHudHasTransport,
    roomTvSinkMuted,
    roomTvVolumeIconClick,
    type RoomTvHudKind,
  } from "$lib/goRoom";
  import {
    createProgramAudioAnalyser,
    roomAudioVisualizerGain,
    roomTvAudioPlayerFace,
    type ProgramAudioAnalyser,
  } from "$lib/goRoomAudioPlayer";
  import { setGoMemoryCanvasWindow } from "$lib/goMemoryCanvas";

  const AUDIO_FACE_BARS = 28;

  let {
    tvOn = false,
    tvStream = null,
    hudOpen = false,
    hudKind = "none",
    isHost = false,
    slotFullscreen = false,
    restore = false,
    paused = true,
    currentTime = 0,
    duration = 0,
    playCanvasUrl = null,
    playCanvasSrcdoc = null,
    playCanvasGeneration = 0,
    ownerDecodeKind = null,
    remoteProgramKind = null,
    onToggle,
    onPlayPause,
    onSeek,
    onFullscreen,
    onPower,
    videoEl = $bindable<HTMLVideoElement | null>(null),
    slotEl = $bindable<HTMLElement | null>(null),
    floats = [],
    caption = null,
  }: {
    tvOn?: boolean;
    tvStream?: MediaStream | null;
    hudOpen?: boolean;
    hudKind?: RoomTvHudKind;
    isHost?: boolean;
    slotFullscreen?: boolean;
    restore?: boolean;
    paused?: boolean;
    currentTime?: number;
    duration?: number;
    playCanvasUrl?: string | null;
    playCanvasSrcdoc?: string | null;
    playCanvasGeneration?: number;
    ownerDecodeKind?: "audio" | "video" | null;
    remoteProgramKind?: "audio" | "video" | null;
    onToggle: () => void;
    onPlayPause: () => void;
    onSeek: (seconds: number) => void;
    onFullscreen: () => void;
    onPower: () => void;
    videoEl?: HTMLVideoElement | null;
    slotEl?: HTMLElement | null;
    floats?: { id: string; emoji: string }[];
    caption?: string | null;
  } = $props();

  const playActive = $derived(
    Boolean(playCanvasUrl || playCanvasSrcdoc)
  );
  const audioFace = $derived(
    roomTvAudioPlayerFace({
      tvOn,
      playActive,
      ownerDecodeKind,
      remoteProgramKind,
    })
  );
  const showTransport = $derived(roomTvHudHasTransport(hudKind));
  const clockMax = $derived(Math.max(duration, currentTime, 0));
  const expanded = $derived(restore || slotFullscreen);
  const sink = roomTvHudDefaultSink();
  let volume = $state(sink.volume);
  let volMuted = $state(sink.muted);
  let volPanel = $state(false);
  const quiet = $derived(roomTvSinkMuted(volume, volMuted));
  let barLevels = $state<number[]>(
    Array.from({ length: AUDIO_FACE_BARS }, () => 0)
  );
  let analyser: ProgramAudioAnalyser | null = null;

  $effect(() => {
    if (!hudOpen) volPanel = false;
  });

  let seenPlayGen = $state<number | null>(null);

  /**
   * srcdoc memory canvas cannot share BroadcastChannel with the shell —
   * session_event fanout uses publishGoMemoryBroadcast → this window.
   * On remount ({#key playCanvasGeneration}) drop the stale iframe window
   * until onload rebinds; publishGoMemoryBroadcast queues until then.
   */
  $effect(() => {
    const gen = playCanvasGeneration;
    if (!playActive) {
      seenPlayGen = null;
      setGoMemoryCanvasWindow(null);
      return;
    }
    if (seenPlayGen != null && seenPlayGen !== gen) {
      setGoMemoryCanvasWindow(null);
    }
    seenPlayGen = gen;
  });

  function onPlayFrameLoad(ev: Event) {
    const el = ev.currentTarget as HTMLIFrameElement;
    setGoMemoryCanvasWindow(el.contentWindow);
  }

  $effect(() => {
    attachMediaStream(videoEl, tvStream, {
      volume,
      // Audio face owns speakers via Web Audio GainNode — keep <video> muted.
      muted: audioFace ? true : volMuted,
      onAutoplayMuted: () => {
        if (!audioFace) volMuted = true;
      },
    });
  });

  $effect(() => {
    if (!audioFace || !tvStream) {
      barLevels = Array.from({ length: AUDIO_FACE_BARS }, () => 0);
      return;
    }

    const handle = createProgramAudioAnalyser({ stream: tvStream });
    if (!handle) {
      barLevels = Array.from({ length: AUDIO_FACE_BARS }, () => 0);
      return;
    }
    analyser = handle;
    let frame = 0;
    const tick = () => {
      // Read sink inside rAF (not effect deps) so volume tweaks do not rebuild AudioContext.
      const sink = { volume, muted: volMuted };
      const gain = roomAudioVisualizerGain(sink);
      handle.setGain(sink);
      barLevels = handle.levels(AUDIO_FACE_BARS, { gain });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      handle.close();
      if (analyser === handle) analyser = null;
    };
  });

  function onVolumeInput(ev: Event) {
    const next = Number((ev.currentTarget as HTMLInputElement).value);
    volume = next;
    volMuted = next <= 0;
    analyser?.setGain({ volume: next, muted: next <= 0 });
  }

  function onVolumeIcon() {
    const next = roomTvVolumeIconClick({
      quiet,
      panelOpen: volPanel,
      volume,
    });
    volMuted = next.muted;
    volPanel = next.panelOpen;
    volume = next.volume;
    analyser?.setGain({ volume: next.volume, muted: next.muted });
  }
</script>

<div class="tv-slot" bind:this={slotEl} class:tv-slot--fs={slotFullscreen}>
  <video
    bind:this={videoEl}
    class={[
      "tv-video",
      !tvOn && "tv-video--off",
      playActive && "tv-video--play-hidden",
      audioFace && "tv-video--audio-face",
    ]
      .filter(Boolean)
      .join(" ")}
    autoplay
    muted
    playsinline
    controls={false}
    aria-label="包廂大螢幕"
  ></video>
  {#if playActive}
    {#if playCanvasSrcdoc}
      {#key playCanvasGeneration}
        <iframe
          class="tv-play-canvas"
          title="包廂遊戲"
          srcdoc={playCanvasSrcdoc}
          onload={onPlayFrameLoad}
        ></iframe>
      {/key}
    {:else if playCanvasUrl}
      {#key playCanvasGeneration}
        <iframe
          class="tv-play-canvas"
          title="包廂遊戲"
          src={playCanvasUrl}
          onload={onPlayFrameLoad}
        ></iframe>
      {/key}
    {/if}
  {:else if !tvOn}
    <span class="tv-snow" aria-hidden="true"></span>
  {:else if audioFace}
    <div
      class="tv-audio-face"
      class:tv-audio-face--paused={paused}
      aria-hidden="true"
    >
      <div class="tv-audio-viz" role="presentation">
        {#each barLevels as level, i (i)}
          <span
            class="tv-audio-bar"
            style={`--h:${Math.max(0.06, level).toFixed(3)}`}
          ></span>
        {/each}
      </div>
      <div class="tv-audio-disc" class:tv-audio-disc--spin={!paused && !quiet}>
        <span class="tv-audio-disc-hole"></span>
      </div>
    </div>
  {/if}
  {#if tvOn && !playActive}
    <button
      type="button"
      class="tv-hit"
      aria-label={hudOpen ? "隱藏播放控制" : "顯示播放控制"}
      aria-expanded={hudOpen}
      onclick={onToggle}
    ></button>
  {/if}
  {#if tvOn && !playActive && hudOpen && hudKind !== "none"}
    <div class="tv-hud" role="toolbar" aria-label="播放器">
      {#if showTransport}
        <button
          type="button"
          class="tv-hud-btn"
          aria-label={paused ? GO_ROOM_TV_PLAY : GO_ROOM_TV_PAUSE}
          onclick={onPlayPause}
        >
          {#if paused}
            <svg class="tv-hud-icon" viewBox="0 0 24 24" aria-hidden="true">
              <polygon points="8 5 20 12 8 19" />
            </svg>
          {:else}
            <svg class="tv-hud-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" />
              <rect x="14" y="5" width="4" height="14" />
            </svg>
          {/if}
        </button>
        <span class="tv-hud-clock">{roomTvClockLabel(currentTime)}</span>
        <label class="tv-hud-seek">
          <span class="sr-only">進度</span>
          <input
            type="range"
            min="0"
            max={clockMax || 0}
            step="0.1"
            value={currentTime}
            disabled={clockMax <= 0}
            oninput={(e) => onSeek(Number((e.currentTarget as HTMLInputElement).value))}
          />
        </label>
        <span class="tv-hud-clock">
          {duration > 0 ? roomTvClockLabel(duration) : "0:00"}
        </span>
      {/if}
      <div class="tv-hud-vol">
        <button
          type="button"
          class="tv-hud-btn"
          aria-label={GO_ROOM_TV_VOLUME}
          aria-expanded={volPanel}
          aria-controls="tv-vol-slider"
          onclick={onVolumeIcon}
        >
          <svg class="tv-hud-icon" viewBox="0 0 24 24" aria-hidden="true">
            {#if quiet}
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            {:else}
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M19 5a9 9 0 0 1 0 14" />
            {/if}
          </svg>
        </button>
        {#if volPanel}
          <div class="tv-hud-vol-pop" id="tv-vol-slider">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              aria-label={GO_ROOM_TV_VOLUME}
              aria-orientation="vertical"
              oninput={onVolumeInput}
            />
          </div>
        {/if}
      </div>
      <button
        type="button"
        class="tv-hud-btn"
        aria-label={expanded ? GO_ROOM_TV_EXIT_FULLSCREEN : GO_ROOM_TV_FULLSCREEN}
        aria-pressed={expanded}
        onclick={onFullscreen}
      >
        <svg class="tv-hud-icon" viewBox="0 0 24 24" aria-hidden="true">
          {#if expanded}
            <path d="M8 3v5H3" />
            <path d="M16 3v5h5" />
            <path d="M8 21v-5H3" />
            <path d="M16 21v-5h5" />
          {:else}
            <path d="M8 3H3v5" />
            <path d="M16 3h5v5" />
            <path d="M8 21H3v-5" />
            <path d="M16 21h5v-5" />
          {/if}
        </svg>
      </button>
      {#if isHost}
        <button
          type="button"
          class="tv-hud-btn"
          aria-label={GO_ROOM_TV_OFF_BTN}
          onclick={onPower}
        >
          <svg class="tv-hud-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2v10" />
            <path d="M8.5 4.6A8 8 0 1 0 15.5 4.6" />
          </svg>
        </button>
      {/if}
    </div>
  {/if}
  {#if floats.length > 0}
    <div class="tv-floats" aria-hidden="true">
      {#each floats as f, i (f.id)}
        <span class="tv-float" style={`--n:${i}`}>{f.emoji}</span>
      {/each}
    </div>
  {/if}
  {#if caption}
    <div class="tv-caption" role="status">
      <p class="tv-caption-text">{caption}</p>
    </div>
  {/if}
</div>

<style>
  .tv-slot {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    min-height: 0;
    background: #0a0a0e;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    box-shadow: var(--pixel-shadow);
    overflow: hidden;
  }
  .tv-slot:fullscreen,
  .tv-slot:-webkit-full-screen,
  .tv-slot--fs {
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }
  .tv-hit {
    position: absolute;
    inset: 0;
    z-index: 1;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }
  .tv-video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }
  .tv-video--off {
    opacity: 0;
  }
  .tv-video--play-hidden,
  .tv-video--audio-face {
    opacity: 0;
    pointer-events: none;
  }
  .tv-play-canvas {
    position: absolute;
    inset: 0;
    z-index: 2;
    width: 100%;
    height: 100%;
    border: 0;
    background: #000;
  }
  .tv-snow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      repeating-linear-gradient(
        0deg,
        #1a1a22 0 1px,
        #0c0c10 1px 3px
      );
    opacity: 0.85;
  }
  .tv-audio-face {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(0.75rem, 4vw, 1.5rem);
    padding: 1rem 0.75rem 2.5rem;
    background:
      radial-gradient(
        ellipse 70% 55% at 50% 42%,
        #1c2438 0%,
        #0a0a0e 72%
      );
    pointer-events: none;
  }
  .tv-audio-viz {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 3px;
    width: min(92%, 28rem);
    height: clamp(4.5rem, 28%, 9rem);
  }
  .tv-audio-bar {
    flex: 1 1 0;
    min-width: 2px;
    max-width: 10px;
    height: calc(var(--h, 0.06) * 100%);
    border-radius: 2px 2px 0 0;
    background: linear-gradient(
      180deg,
      #f0e6c8 0%,
      #c4a574 55%,
      #8a6a3a 100%
    );
    opacity: 0.92;
    transition: height 40ms linear;
  }
  .tv-audio-face--paused .tv-audio-bar {
    opacity: 0.45;
  }
  .tv-audio-disc {
    width: clamp(4.5rem, 18vw, 7rem);
    height: clamp(4.5rem, 18vw, 7rem);
    border-radius: 50%;
    background:
      radial-gradient(circle at 35% 30%, #3a3a48 0%, #1a1a22 45%, #0e0e14 100%);
    border: 3px solid color-mix(in oklab, #c4a574 55%, #2a2a32);
    box-shadow: inset 0 0 0 10px #121218;
    display: grid;
    place-items: center;
  }
  .tv-audio-disc--spin {
    animation: tv-audio-spin 4.5s linear infinite;
  }
  .tv-audio-disc-hole {
    width: 18%;
    height: 18%;
    border-radius: 50%;
    background: #0a0a0e;
    border: 2px solid #c4a574;
  }
  @keyframes tv-audio-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .tv-hud {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0.15rem;
    padding: 0.2rem 0.3rem calc(0.25rem + env(safe-area-inset-bottom, 0px));
    background: color-mix(in oklab, #000 55%, transparent);
    color: #f4efe4;
    pointer-events: auto;
  }
  .tv-hud-btn {
    flex: 0 0 auto;
    min-width: 44px;
    min-height: 44px;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: var(--radius);
    background: transparent;
    color: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .tv-hud-btn:focus-visible {
    outline: 2px solid #f4efe4;
    outline-offset: 2px;
  }
  .tv-hud-icon {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tv-hud-icon polygon,
  .tv-hud-icon rect {
    fill: currentColor;
    stroke: none;
  }
  .tv-hud-clock {
    flex: 0 0 auto;
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    padding: 0 0.1rem;
  }
  .tv-hud-seek {
    flex: 1 1 auto;
    min-width: 2.5rem;
    display: flex;
    align-items: center;
  }
  .tv-hud-seek input {
    width: 100%;
    min-height: 44px;
    margin: 0;
    accent-color: #f4efe4;
  }
  .tv-hud-vol {
    position: relative;
    flex: 0 0 auto;
  }
  .tv-hud-vol-pop {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 0.2rem);
    z-index: 4;
    width: 44px;
    height: 7.25rem;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in oklab, #000 72%, transparent);
    border-radius: var(--radius);
  }
  .tv-hud-vol-pop input {
    width: 6.5rem;
    height: 44px;
    margin: 0;
    transform: rotate(-90deg);
    accent-color: #f4efe4;
  }
  .tv-floats {
    position: absolute;
    right: 0.45rem;
    bottom: 2.4rem;
    z-index: 2;
    pointer-events: none;
    display: flex;
    flex-direction: row-reverse;
    gap: 0.15rem;
    align-items: flex-end;
  }
  .tv-float {
    font-size: 1.55rem;
    line-height: 1;
    animation: tv-float-up 2.2s ease-out forwards;
    animation-delay: calc(var(--n, 0) * 40ms);
  }
  @keyframes tv-float-up {
    0% {
      transform: translateY(0) scale(0.85);
      opacity: 1;
    }
    100% {
      transform: translateY(-7.5rem) scale(1.15);
      opacity: 0;
    }
  }
  .tv-caption {
    position: absolute;
    left: 0.4rem;
    right: 0.4rem;
    bottom: 0.35rem;
    z-index: 2;
    pointer-events: none;
    overflow: hidden;
    padding: 0.28rem 0.5rem;
    border-radius: var(--radius);
    background: color-mix(in oklab, #000 62%, transparent);
    color: #fff;
  }
  .tv-caption-text {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 700;
    line-height: 1.35;
    white-space: nowrap;
    animation: tv-caption-marquee 3s linear both;
  }
  @keyframes tv-caption-marquee {
    0% {
      transform: translateX(100%);
    }
    100% {
      transform: translateX(-100%);
    }
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
