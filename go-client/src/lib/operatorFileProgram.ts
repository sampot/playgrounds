/**
 * Daemon Hub file cast on Operator — Hub updates cast metadata only; Operator
 * fetches bytes via owner DC and decodes locally for the TV slot.
 */

import type { BoothStateSnapshot } from "@pg/roster/boothChannel";
import type { CapturedProgram } from "./goRoomMedia";

export type OperatorCastFileScope = "share" | "private";

export function castFileScope(
  cast: BoothStateSnapshot["cast"] | undefined
): OperatorCastFileScope {
  return cast?.scope === "private" ? "private" : "share";
}

export function castFileId(
  cast: BoothStateSnapshot["cast"] | undefined
): string | null {
  if (!cast || cast.kind !== "file") return null;
  const id = typeof cast.id === "string" ? cast.id.trim() : "";
  return id || null;
}

export function mediaStreamFromProgram(
  program: CapturedProgram | null
): MediaStream | null {
  if (!program || typeof MediaStream !== "function") return null;
  const tracks = [program.video, program.audio].filter(
    (t): t is MediaStreamTrack => Boolean(t)
  );
  if (!tracks.length) return null;
  try {
    return new MediaStream(tracks);
  } catch {
    return null;
  }
}

export function applyProgramTransport(
  program: CapturedProgram,
  cast: BoothStateSnapshot["cast"] | undefined
): void {
  if (!cast || cast.kind !== "file") return;
  if (cast.paused === true) program.pause?.();
  else if (cast.paused === false) program.play?.();
  if (typeof cast.t === "number" && Number.isFinite(cast.t) && cast.t >= 0) {
    program.seek?.(cast.t);
  }
}

export type OperatorFileProgramDeps = {
  fetchFile: (
    id: string,
    scope: OperatorCastFileScope
  ) => Promise<File | null>;
  capture: (file: File) => Promise<CapturedProgram | null>;
  onStream: (stream: MediaStream | null) => void;
  onError?: (message: string) => void;
};

export class OperatorFileProgram {
  #deps: OperatorFileProgramDeps;
  #activeId: string | null = null;
  #program: CapturedProgram | null = null;
  #gen = 0;

  constructor(deps: OperatorFileProgramDeps) {
    this.#deps = deps;
  }

  get program(): CapturedProgram | null {
    return this.#program;
  }

  stop(): void {
    this.#activeId = null;
    this.#program?.stop();
    this.#program = null;
    this.#deps.onStream(null);
  }

  async syncCast(cast: BoothStateSnapshot["cast"] | undefined): Promise<void> {
    if (
      !cast ||
      cast.kind === "idle" ||
      cast.kind === "live" ||
      cast.kind === "play"
    ) {
      this.stop();
      return;
    }
    if (cast.kind !== "file") return;

    const id = castFileId(cast);
    if (!id) return;
    const scope = castFileScope(cast);

    if (id === this.#activeId && this.#program) {
      applyProgramTransport(this.#program, cast);
      return;
    }

    const gen = ++this.#gen;
    this.stop();

    const file = await this.#deps.fetchFile(id, scope);
    if (gen !== this.#gen) return;
    if (!file) {
      this.#deps.onError?.("無法載入大螢幕檔案");
      return;
    }

    const program = await this.#deps.capture(file);
    if (gen !== this.#gen) {
      program?.stop();
      return;
    }
    if (!program) {
      this.#deps.onError?.("此瀏覽器無法播放這個檔案");
      return;
    }

    this.#activeId = id;
    this.#program = program;
    applyProgramTransport(program, cast);
    this.#deps.onStream(mediaStreamFromProgram(program));
  }
}
