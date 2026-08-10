<script lang="ts">
  import { dash } from "$lib/dash.svelte";
  import { copyText, formatTime } from "$lib/api";

  let regInviteUrl = $state("");
  let topupDraft = $state<Record<string, string>>({});

  async function issueRegInvite() {
    dash.busy = true;
    try {
      const res = await fetch("/v1/admin/registration-invites", {
        method: "POST",
        body: "{}",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        dash.flash("發出失敗，請稍後再試", "err");
        return;
      }
      regInviteUrl = data.join_url || "";
      dash.flash("已發出註冊邀請", "ok");
    } finally {
      dash.busy = false;
    }
  }

  async function adminAddCredits(userId: string) {
    const raw = (topupDraft[userId] || "").trim();
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 1 || !Number.isInteger(amount)) {
      dash.flash("請輸入正整數點數", "warn");
      return;
    }
    dash.busy = true;
    try {
      const res = await fetch(
        `/v1/admin/users/${encodeURIComponent(userId)}/credits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
          credentials: "include",
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        dash.flash(data.error || "加點失敗", "err");
        return;
      }
      topupDraft = { ...topupDraft, [userId]: "" };
      dash.flash(`已加點，餘額 ${data.balance ?? "—"}`, "ok");
      await dash.loadUsers();
      if (dash.me?.user_id === userId) await dash.refreshMe();
    } finally {
      dash.busy = false;
    }
  }

  async function adminSetTurnHosted(userId: string, enabled: boolean) {
    dash.askConfirm({
      title: enabled ? "開通連線備援" : "關閉連線備援",
      message: enabled
        ? "開通後，此使用者在點數足夠時可自動使用官方連線備援（對對弈者不顯示直連／轉發）。"
        : "關閉後，此使用者無法再取得官方連線備援。",
      confirmLabel: enabled ? "開通" : "關閉",
      action: async () => {
        const res = await fetch(
          `/v1/admin/users/${encodeURIComponent(userId)}/entitlements/turn.hosted`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled }),
            credentials: "include",
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          dash.flash(data.error || "無法更新", "err");
          return;
        }
        dash.flash(enabled ? "已開通連線備援" : "已關閉連線備援", "ok");
        await dash.loadUsers();
        if (dash.me?.user_id === userId) await dash.refreshMe();
      },
    });
  }

  async function setDisabled(userId: string, disabled: boolean) {
    dash.askConfirm({
      title: disabled ? "停用使用者" : "恢復使用者",
      message: disabled
        ? "停用後，對方將無法進入後台，遊樂場通行證也會失效。"
        : "恢復後，對方可再次進入後台並重新登入場。",
      action: async () => {
        const path = disabled ? "disable" : "enable";
        const res = await fetch(
          `/v1/admin/users/${encodeURIComponent(userId)}/${path}`,
          { method: "POST", body: "{}", credentials: "include" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            data.error === "cannot_disable_self"
              ? "不能停用自己的帳號"
              : data.error === "last_admin"
                ? "請先請其他人接手後台管理，再停用此帳號"
                : "操作失敗，請稍後再試";
          dash.flash(msg, "err");
          return;
        }
        await dash.loadUsers();
        dash.flash(disabled ? "已停用" : "已恢復", "ok");
      },
    });
  }
</script>

<div class="panel">
  <h2>註冊邀請</h2>
  <p class="lede">發出邀請連結，讓新人完成註冊並進入後台。</p>
  <div class="row">
    <button type="button" disabled={dash.busy} onclick={issueRegInvite}
      >發出註冊邀請</button
    >
  </div>
  {#if regInviteUrl}
    <div class="secret">
      <strong>註冊邀請</strong>
      <code class="mono">{regInviteUrl}</code>
      <div class="row">
        <button
          type="button"
          class="secondary"
          onclick={async () => {
            const ok = await copyText(regInviteUrl);
            dash.flash(ok ? "已複製" : "複製失敗", ok ? "ok" : "warn");
          }}
        >
          複製連結
        </button>
      </div>
    </div>
  {/if}
</div>

<div class="panel">
  <h2>註冊使用者</h2>
  <p class="lede">檢視已註冊帳號；可停用／恢復、加點、開通連線備援。</p>
  <div class="user-list">
    {#each dash.users as u (u.user_id)}
      <div class="user-row">
        <header>
          <span class="mono">{u.user_id}</span>
          <span class="badge">{u.role === "admin" ? "管理者" : "使用者"}</span>
          {#if u.disabled}
            <span class="badge disabled">已停用</span>
          {:else}
            <span class="badge">使用中</span>
          {/if}
          {#if u.turn_hosted}
            <span class="badge">連線備援</span>
          {/if}
        </header>
        <p class="meta">
          {#if u.github}GitHub @{u.github.login}{/if}
          {#if u.github && u.google}·{/if}
          {#if u.google}Google {u.google.email}{/if}
          {#if !u.github && !u.google}尚未連結登入方式{/if}
          · {u.key ? `${u.key.prefix}…` : "尚無通行證"}
          · 點數 {u.credits ?? 0}
          · {formatTime(u.created_at)}
        </p>
        <div class="row wrap">
          {#if u.disabled}
            <button
              type="button"
              class="secondary"
              disabled={u.user_id === dash.me?.user_id || dash.busy}
              onclick={() => setDisabled(u.user_id, false)}>恢復</button
            >
          {:else}
            <button
              type="button"
              class="danger"
              disabled={u.user_id === dash.me?.user_id || dash.busy}
              onclick={() => setDisabled(u.user_id, true)}>停用</button
            >
          {/if}
          {#if !u.disabled}
            {#if u.turn_hosted}
              <button
                type="button"
                class="secondary"
                disabled={dash.busy}
                onclick={() => adminSetTurnHosted(u.user_id, false)}
                >關閉連線備援</button
              >
            {:else}
              <button
                type="button"
                disabled={dash.busy}
                onclick={() => adminSetTurnHosted(u.user_id, true)}
                >開通連線備援</button
              >
            {/if}
            <label class="topup">
              <span class="sr-only">加點數量</span>
              <input
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                placeholder="點數"
                value={topupDraft[u.user_id] ?? ""}
                oninput={(e) => {
                  topupDraft = {
                    ...topupDraft,
                    [u.user_id]: e.currentTarget.value,
                  };
                }}
                disabled={dash.busy}
              />
              <button
                type="button"
                class="secondary"
                disabled={dash.busy}
                onclick={() => adminAddCredits(u.user_id)}>加點</button
              >
            </label>
          {/if}
        </div>
      </div>
    {:else}
      <p class="meta">尚無註冊使用者。</p>
    {/each}
  </div>
</div>
