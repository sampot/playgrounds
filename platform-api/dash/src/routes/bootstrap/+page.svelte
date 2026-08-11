<script lang="ts">
  import Flash from "$lib/components/Flash.svelte";

  let token = $state("");
  let flashMsg = $state("");
  let flashKind = $state<"ok" | "warn" | "err">("ok");

  $effect(() => {
    const err = new URLSearchParams(location.search).get("auth_error");
    if (err) {
      flashMsg = "初次設定失敗，請確認後再試。";
      flashKind = "err";
    }
  });

  function startGithub() {
    if (!token.trim()) {
      flashMsg = "請先填入設定用密碼";
      flashKind = "warn";
      return;
    }
    location.href = `/auth/github?intent=bootstrap&bootstrap_token=${encodeURIComponent(token.trim())}`;
  }
</script>

<svelte:head>
  <title>遊樂場後台 · 初次設定</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="main">
  <div class="hero">
    <h1>初次設定</h1>
    <p>建立第一位管理者帳號。此頁不在一般進入畫面顯示。</p>
  </div>
  <Flash message={flashMsg} kind={flashKind} />
  <div class="panel">
    <h2>設定用密碼</h2>
    <p class="lede">
      填入部署時準備的一次性密碼，再以 GitHub 完成綁定。若先前已建立管理者、尚未連結
      GitHub，可用同一組密碼再綁一次。LINE 亦可完成設定，但建議保留 GitHub／Google 為對照方式。
    </p>
    <label for="boot-token">設定用密碼</label>
    <input
      id="boot-token"
      class="mono"
      type="password"
      autocomplete="off"
      bind:value={token}
    />
    <div class="row">
      <button type="button" onclick={startGithub}>以 GitHub 完成設定</button>
      <a class="btn secondary" href="/auth/line?intent=bootstrap&bootstrap_token={encodeURIComponent(token)}">以 LINE 完成設定</a>
      <a class="btn secondary" href="/">回後台</a>
    </div>
  </div>
  <footer class="foot">
    <a href="/">回後台首頁</a>
  </footer>
</main>

<style>
  label {
    display: block;
    margin: 0 0 0.3rem;
    font-size: 0.82rem;
    color: color-mix(in oklab, rgb(var(--ink)) 58%, transparent);
  }
  input {
    width: 100%;
    appearance: none;
    border: 1px solid rgb(var(--line));
    border-radius: 0.35rem;
    background: rgb(var(--fill));
    color: rgb(var(--ink));
    padding: 0.62rem 0.72rem;
    font: inherit;
    font-size: 0.92rem;
    margin-bottom: 0.65rem;
  }
</style>
