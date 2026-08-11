<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import Flash from "$lib/components/Flash.svelte";
  import { api, formatTime } from "$lib/api";
  import { authErrorMessage } from "$lib/authErrors";

  let status = $state<"loading" | "valid" | "expired" | "used" | "not_found">(
    "loading"
  );
  let expiresAt = $state<number | undefined>();
  let flashMsg = $state("");
  let flashKind = $state<"ok" | "warn" | "err">("ok");

  const token = $derived(page.params.token || "");

  onMount(() => {
    const authErr = new URLSearchParams(location.search).get("auth_error");
    if (authErr) {
      const { message, known } = authErrorMessage(authErr);
      flashMsg = message;
      flashKind = "err";
      if (known) {
        status = "not_found";
        return;
      }
    }
    void (async () => {
      const { res, data } = await api<{
        ok?: boolean;
        status?: string;
        expires_at?: number;
      }>(`/v1/join/${encodeURIComponent(token)}`);
      expiresAt = data.expires_at;
      if (res.ok && data.status === "valid") {
        status = "valid";
        return;
      }
      if (data.status === "expired") status = "expired";
      else if (data.status === "used") status = "used";
      else status = "not_found";
      flashMsg =
        status === "expired"
          ? "這份註冊邀請已過期。"
          : status === "used"
            ? "這份註冊邀請已經使用過了。"
            : "這份註冊邀請不存在或無效。";
      flashKind = "warn";
    })();
  });
</script>

<svelte:head>
  <title>遊樂場註冊邀請 · 我是山姆鍋</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="main">
  <div class="hero">
    <h1>遊樂場</h1>
    <p>接受邀請後，用 GitHub 或 Google 完成註冊即可進入後台。</p>
  </div>
  <Flash message={flashMsg} kind={flashKind} />
  <div class="panel">
    <h2>註冊邀請</h2>
    {#if status === "loading"}
      <p class="lede">正在確認邀請…</p>
    {:else if status === "valid"}
      <p class="lede">
        邀請有效。請選擇一種方式完成註冊；完成後即可進入後台。
      </p>
      {#if expiresAt}
        <p class="meta">到期：{formatTime(expiresAt)}</p>
      {/if}
      <div class="row">
        <a
          class="btn"
          href="/auth/github?intent=join&token={encodeURIComponent(token)}"
          >以 GitHub 註冊</a
        >
        <a
          class="btn secondary"
          href="/auth/google?intent=join&token={encodeURIComponent(token)}"
          >以 Google 註冊</a
        >
        <a
          class="btn secondary"
          href="/auth/line?intent=join&token={encodeURIComponent(token)}"
          >以 LINE 註冊</a
        >
      </div>
    {:else}
      <p class="lede">
        <span class="badge disabled">
          {status === "expired"
            ? "已過期"
            : status === "used"
              ? "已使用"
              : "無效"}
        </span>
      </p>
      <div class="row">
        <a class="btn secondary" href="/">回後台</a>
        <a class="btn secondary" href="https://play.samkuo.me/">前往遊樂場</a>
      </div>
    {/if}
  </div>
</main>
