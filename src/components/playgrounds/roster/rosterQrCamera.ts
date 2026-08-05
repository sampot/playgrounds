/**
 * Live camera QR scan for Roster invite／reply (DEC-045 Phase 4.2).
 * BarcodeDetector when available；otherwise **must** decode via npm `qr`
 * (`decodeRosterQrFromImage` → `qr/decode`).
 */

import { decodeRosterQrFromImage, RosterQrError } from "./rosterQr";

export type RosterCameraScanStop = () => void;

type BarcodeDetectorLike = {
  detect: (
    source: ImageBitmapSource
  ) => Promise<Array<{ rawValue?: string }>>;
};

export type RosterCameraDetectDeps = {
  /** null ⇒ skip native detector；use npm `qr` only. */
  getDetector: () => BarcodeDetectorLike | null;
  decodeImage: typeof decodeRosterQrFromImage;
  createCanvas: () => HTMLCanvasElement;
};

function getBarcodeDetector(): BarcodeDetectorLike | null {
  const g = globalThis as {
    BarcodeDetector?: new (opts?: {
      formats?: string[];
    }) => BarcodeDetectorLike;
  };
  if (typeof g.BarcodeDetector !== "function") return null;
  try {
    return new g.BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

const defaultDetectDeps: RosterCameraDetectDeps = {
  getDetector: getBarcodeDetector,
  decodeImage: decodeRosterQrFromImage,
  createCanvas: () => document.createElement("canvas"),
};

/**
 * Decode one video frame. Prefer BarcodeDetector；if unsupported or empty,
 * fall back to npm `qr` via canvas ImageData.
 */
export async function detectRosterQrFromVideoFrame(
  video: HTMLVideoElement,
  deps: Partial<RosterCameraDetectDeps> = {}
): Promise<string | null> {
  const d: RosterCameraDetectDeps = { ...defaultDetectDeps, ...deps };
  if (video.readyState < 2 || video.videoWidth < 8 || video.videoHeight < 8) {
    return null;
  }

  const detector = d.getDetector();
  if (detector) {
    try {
      const codes = await detector.detect(video);
      const raw = codes.find(c => typeof c.rawValue === "string")?.rawValue;
      if (raw?.trim()) return raw.trim();
    } catch {
      /* fall through to npm qr */
    }
  }

  // No BarcodeDetector (or no hit yet): npm `qr` package decode.
  const canvas = d.createCanvas();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  try {
    return d.decodeImage(imageData);
  } catch {
    return null;
  }
}

/**
 * Open the user-facing camera and poll for a QR until `stop` or first hit.
 */
export async function startRosterCameraQrScan(opts: {
  video: HTMLVideoElement;
  onCode: (text: string) => void;
  onError?: (err: Error) => void;
  intervalMs?: number;
  /** Injected for tests. */
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  detectDeps?: Partial<RosterCameraDetectDeps>;
}): Promise<RosterCameraScanStop> {
  const getUserMedia =
    opts.getUserMedia ??
    (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
      ? (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c)
      : null);
  if (!getUserMedia) {
    throw new RosterQrError("no_camera", "此環境不支援相機掃碼");
  }

  let stream: MediaStream;
  try {
    stream = await getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch (e) {
    throw new RosterQrError(
      "camera_denied",
      e instanceof Error ? e.message : "無法開啟相機"
    );
  }

  const video = opts.video;
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  try {
    await video.play();
  } catch (e) {
    for (const t of stream.getTracks()) t.stop();
    video.srcObject = null;
    throw new RosterQrError(
      "camera_play",
      e instanceof Error ? e.message : "無法播放相機畫面"
    );
  }

  const intervalMs = opts.intervalMs ?? 350;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inflight = false;

  const stop: RosterCameraScanStop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
    for (const t of stream.getTracks()) t.stop();
    if (video.srcObject === stream) video.srcObject = null;
  };

  timer = setInterval(() => {
    if (stopped || inflight) return;
    inflight = true;
    void detectRosterQrFromVideoFrame(video, opts.detectDeps)
      .then(text => {
        if (stopped || !text) return;
        stop();
        opts.onCode(text);
      })
      .catch(e => {
        opts.onError?.(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        inflight = false;
      });
  }, intervalMs);

  return stop;
}

/** True when getUserMedia is available (UI can show 相機掃碼). */
export function rosterCameraScanSupported(): boolean {
  return Boolean(
    typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
  );
}
