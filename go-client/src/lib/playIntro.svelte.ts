/**
 * 「進入遊玩」開場（DEC-050 純玩版 Guest）。
 *
 * 路由切換用 `pixelWipe`（輕、短）；真正踏進畫布這一下另給一段較重的
 * 8-bit 開場（上下閘門拉開 + 掃描線），讓「開始玩」有關卡開場感。
 * 只放狀態與計時；視覺在 `GoPlayIntro.svelte`。
 */

import { prefersReducedMotion } from "./goTransition";

/** 開場總長（ms），需與 `GoPlayIntro.svelte` 的 keyframes 對齊。 */
export const GO_PLAY_INTRO_MS = 420;

class GoPlayIntroStore {
  active = $state(false);
  #timer = 0;

  /** 播一次開場；重複呼叫會重新計時（例如連續換遊戲）。 */
  start(): void {
    if (prefersReducedMotion()) return;
    this.#clearTimer();
    this.active = true;
    this.#timer = setTimeout(() => {
      this.active = false;
      this.#timer = 0;
    }, GO_PLAY_INTRO_MS) as unknown as number;
  }

  /** 中止開場（離開遊玩態、元件卸載）。 */
  cancel(): void {
    this.#clearTimer();
    this.active = false;
  }

  #clearTimer(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = 0;
    }
  }
}

export const goPlayIntro = new GoPlayIntroStore();
