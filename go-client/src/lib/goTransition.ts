/**
 * 8-bit 路徑切換轉場（純 CSS，無外部資源）。
 * 以 `clip-path` 階梯式橫向「百葉」揭開／蓋走，強化頁面切換的像素手感。
 * 進場與離場同向（皆左→右），兩頁同格疊放時看起來像一道連續的抹除。
 * 遵守 `prefers-reduced-motion: reduce`：直接以無動作結束。
 */

import type { TransitionConfig } from "svelte/transition";

export interface PixelWipeParams {
  /** 覆寫時長（ms）。 */
  duration?: number;
  /** 量化格數，越少越有 8-bit 階梯感。 */
  steps?: number;
}

const INTRO_MS = 260;
const OUTRO_MS = 200;
const STEPS = 8;
/** 進／離場的橫向位移量（px），整數維持像素對齊。 */
const DRIFT_PX = 8;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function quantise(t: number, steps: number): number {
  return Math.round(t * steps) / steps;
}

/** 進場：自左向右階梯揭開。 */
export function pixelWipe(
  _node: Element,
  params: PixelWipeParams = {}
): TransitionConfig {
  if (prefersReducedMotion()) return { duration: 0 };
  const steps = params.steps ?? STEPS;
  return {
    duration: params.duration ?? INTRO_MS,
    easing: (t: number) => t,
    css: (t: number) => {
      const stepped = quantise(t, steps);
      const inset = (1 - stepped) * 100;
      return `clip-path: inset(0 ${inset}% 0 0); transform: translateX(${
        (1 - stepped) * DRIFT_PX
      }px);`;
    },
  };
}

/**
 * 離場：自左向右階梯蓋走（與進場同向）。
 * 比進場短，讓新頁在視覺上帶頭。
 */
export function pixelWipeOut(
  _node: Element,
  params: PixelWipeParams = {}
): TransitionConfig {
  if (prefersReducedMotion()) return { duration: 0 };
  const steps = params.steps ?? STEPS;
  return {
    duration: params.duration ?? OUTRO_MS,
    easing: (t: number) => t,
    css: (t: number) => {
      const stepped = quantise(t, steps);
      const inset = (1 - stepped) * 100;
      return `clip-path: inset(0 0 0 ${inset}%); transform: translateX(${
        (1 - stepped) * -DRIFT_PX
      }px);`;
    },
  };
}
