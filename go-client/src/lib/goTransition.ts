/**
 * 8-bit 路徑切換轉場（純 CSS，無外部資源）。
 * 以 `clip-path` 階梯式橫向「百葉」揭開，強化遊戲換關感。
 * 遵守 `prefers-reduced-motion: reduce`：直接以無動作結束。
 */

import type { TransitionConfig } from "svelte/transition";

function reducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 進場：自左向右階梯揭開。 */
export function pixelWipe(node: Element, _params?: Record<string, never>): TransitionConfig {
  if (reducedMotion()) return { duration: 0 };
  return {
    duration: 260,
    easing: (t: number) => t,
    css: (t: number) => {
      // steps() 手感：把進度量化成 8 格。
      const steps = 8;
      const stepped = Math.round(t * steps) / steps;
      const inset = (1 - stepped) * 100;
      return `clip-path: inset(0 ${inset}% 0 0); transform: translateX(${(1 - stepped) * 8}px);`;
    },
  };
}
