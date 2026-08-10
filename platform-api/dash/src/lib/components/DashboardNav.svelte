<script lang="ts">
  import { dash } from "$lib/dash.svelte";
  import { page } from "$app/stores";

  const links = $derived([
    { href: "/", label: "遊樂場", admin: false },
    { href: "/account", label: "帳號", admin: false },
    ...(dash.isAdmin
      ? [
          { href: "/ops", label: "營運", admin: true },
          { href: "/analytics", label: "分析", admin: true },
        ]
      : []),
  ]);

  const current = $derived($page.url.pathname);
</script>

<nav class="dashnav" aria-label="後台導覽">
  {#each links as l (l.href)}
    <a
      class="dashnav-link"
      class:on={current === l.href}
      href={l.href}
      aria-current={current === l.href ? "page" : undefined}
      >{l.label}</a
    >
  {/each}
</nav>
