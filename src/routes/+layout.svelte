<script lang="ts">
  import { page } from "$app/state";
  import "@styles/global.css";

  let { children } = $props();

  let activeNav = $derived(
    page.url.pathname.startsWith("/sam") ? ("sam" as const) : ("field" as const)
  );
  let isPage = $derived(activeNav === "sam");
</script>

<div
  class={["playgrounds-page", isPage && "playgrounds-page--scroll"]
    .filter(Boolean)
    .join(" ")}
>
  <header
    class="playgrounds-host-header border-skin-line text-skin-base/70 flex shrink-0 items-center gap-3 border-b px-3 py-1.5 text-xs"
  >
    <div class="playgrounds-host-brand flex min-w-0 items-center gap-2">
      <a
        class="text-skin-base/80 flex min-w-0 items-center gap-2 no-underline"
        href="https://samkuo.me/"
        rel="noopener noreferrer"
        aria-label="我是山姆鍋"
      >
        <img
          class="playgrounds-host-logo"
          src="/favicon.svg"
          alt=""
          width="20"
          height="20"
          decoding="async"
        />
        <span>我是山姆鍋</span>
      </a>
      <span class="text-skin-base/40" aria-hidden="true">·</span>
      <a
        class={[
          "no-underline",
          activeNav === "field"
            ? "text-skin-base font-medium"
            : "text-skin-base/80",
        ].join(" ")}
        href="/"
        aria-label="遊樂場首頁"
        aria-current={activeNav === "field" ? "page" : undefined}>遊樂場</a
      >
      <span class="text-skin-base/40" aria-hidden="true">·</span>
      <a
        class={[
          "no-underline",
          activeNav === "sam"
            ? "text-skin-base font-medium"
            : "text-skin-base/80",
        ].join(" ")}
        href="/sam/"
        aria-current={activeNav === "sam" ? "page" : undefined}>小品</a
      >
      <span class="text-skin-base/40" aria-hidden="true">·</span>
      <a
        class="text-skin-base/80 no-underline"
        href="https://docs.samkuo.me/"
        rel="noopener noreferrer">文件</a
      >
    </div>
  </header>
  <main
    id="main-content"
    class={isPage ? "playgrounds-page-main" : "app-shell playgrounds-main"}
  >
    {@render children()}
  </main>
</div>
