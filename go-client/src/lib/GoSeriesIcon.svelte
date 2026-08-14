<script lang="ts">
  /**
   * 純 SVG 像素藝術分類圖示（無外部資源、離線可用）。
   * 取代原本 emoji 分類標記——emoji 在各 OS 渲染不一致，破壞 8-bit 一致性。
   * 圖示以 `currentColor` 描繪，繼承所在元素的文字色（通常為 --ink／--accent）。
   */

  type Props = {
    series: string | undefined | null;
    size?: number;
  };

  let { series, size = 20 }: Props = $props();

  // 12x12 網格上的實心方塊：[x, y, w, h]
  type Rect = [number, number, number, number];

  const SHAPES: Record<string, Rect[]> = {
    精緻可玩: [
      [3, 2, 6, 1],
      [2, 3, 8, 1],
      [2, 4, 1, 6],
      [9, 4, 1, 6],
      [2, 9, 8, 1],
      [4, 5, 2, 2],
      [7, 5, 2, 2],
    ],
    街機: [
      [4, 1, 4, 1],
      [3, 2, 6, 5],
      [4, 3, 4, 3],
      [2, 8, 8, 1],
      [1, 9, 10, 2],
      [4, 10, 1, 1],
      [7, 10, 1, 1],
    ],
    懷舊: [
      [3, 2, 6, 4],
      [2, 6, 8, 1],
      [4, 7, 4, 1],
      [3, 9, 2, 1],
      [7, 9, 2, 1],
      [2, 3, 1, 2],
      [9, 3, 1, 2],
    ],
    機台: [
      [3, 1, 6, 2],
      [2, 3, 8, 4],
      [4, 4, 4, 2],
      [1, 8, 10, 1],
      [2, 9, 2, 2],
      [8, 9, 2, 2],
      [5, 10, 2, 1],
    ],
    桌遊: [
      [2, 3, 8, 6],
      [3, 2, 6, 1],
      [3, 9, 6, 1],
      [2, 4, 1, 4],
      [9, 4, 1, 4],
      [4, 5, 2, 2],
      [7, 5, 2, 2],
    ],
  };

  const DEFAULT_SHAPE: Rect[] = [
    [3, 3, 6, 6],
    [2, 4, 1, 4],
    [9, 4, 1, 4],
    [4, 2, 4, 1],
    [4, 9, 4, 1],
    [5, 5, 2, 2],
  ];

  const rects = $derived(SHAPES[series ?? ""] ?? DEFAULT_SHAPE);
</script>

<svg
  class="go-series-icon"
  width={size}
  height={size}
  viewBox="0 0 12 12"
  shape-rendering="crispEdges"
  fill="currentColor"
  aria-hidden="true"
  focusable="false"
>
  {#each rects as r (r.join(','))}
    <rect x={r[0]} y={r[1]} width={r[2]} height={r[3]} />
  {/each}
</svg>

<style>
  .go-series-icon {
    display: block;
    image-rendering: pixelated;
  }
</style>
