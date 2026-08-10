<script lang="ts">
  import { dash } from "$lib/dash.svelte";
  import { formatTime } from "$lib/api";

  let defaultFieldDraft = $state(
    dash.me?.default_field_url || "https://play.samkuo.me"
  );
  $effect(() => {
    if (dash.me?.default_field_url) defaultFieldDraft = dash.me.default_field_url;
  });

  async function loginToField() {
    const ret = dash.peekReturnField();
    await dash.provisionAndOpenField(ret || null, { skipConfirm: false });
  }

  async function saveDefaultField() {
    dash.busy = true;
    try {
      const { res, data } = await fetch("/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_field_url: defaultFieldDraft }),
        credentials: "include",
      }).then(async (r) => ({ res: r, data: await r.json().catch(() => ({})) }));
      if (!res.ok) {
        dash.flash(
          data.error === "invalid_default_field_url"
            ? "網址無效（請用官方場如 play.samkuo.me）"
            : "儲存失敗，請稍後再試",
          "err"
        );
        return;
      }
      if (data.default_field_url) defaultFieldDraft = data.default_field_url;
      await dash.refreshMe();
      dash.flash("已儲存預設遊樂場", "ok");
    } finally {
      dash.busy = false;
    }
  }

  async function revokeKey() {
    if (!dash.me?.key) return;
    dash.askConfirm({
      title: "撤銷通行證",
      message: "撤銷後，已登入的遊樂場將無法再發出邀請，直到再次「登入我的遊樂場」。",
      action: async () => {
        const res = await fetch("/v1/keys", {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          dash.flash("撤銷失敗，請稍後再試", "err");
          return;
        }
        await dash.refreshMe();
        dash.flash("已撤銷通行證", "ok");
      },
    });
  }

  async function setTurnPrefer(prefer: boolean) {
    if (!dash.me) return;
    if (prefer && !dash.me.turn_hosted) {
      dash.flash("需管理者先開通連線備援資格", "warn");
      return;
    }
    dash.busy = true;
    try {
      const res = await fetch("/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turn_prefer: prefer }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        dash.flash(
          data.error === "turn_not_entitled"
            ? "需管理者先開通連線備援資格"
            : data.error || "無法更新",
          "err"
        );
        return;
      }
      dash.me = { ...dash.me, turn_prefer: Boolean(data.turn_prefer) };
      dash.flash(prefer ? "已啟用連線備援" : "已關閉連線備援", "ok");
    } finally {
      dash.busy = false;
    }
  }
</script>

<div class="panel">
  <h2>登入我的遊樂場</h2>
  <p class="lede">
    取得通行證並開啟你的場。同一時間只能登入一個遊樂場；關閉頁面後需重新登入。
  </p>
  {#if dash.returnFieldHint}
    <p class="meta">將開啟：<span class="mono">{dash.returnFieldHint}</span></p>
  {/if}
  <div class="row">
    <button type="button" disabled={dash.busy} onclick={loginToField}
      >登入我的遊樂場</button
    >
  </div>
</div>

<div class="panel">
  <h2>預設遊樂場</h2>
  <p class="lede">
    「登入我的遊樂場」會開啟此網址（官方場如 play.samkuo.me）。
  </p>
  <label class="meta" for="default-field">預設網址</label>
  <input
    id="default-field"
    class="mono"
    type="url"
    bind:value={defaultFieldDraft}
    placeholder="https://play.samkuo.me"
  />
  <div class="row">
    <button type="button" class="secondary" disabled={dash.busy} onclick={saveDefaultField}
      >儲存</button
    >
  </div>
</div>

<div class="panel">
  <h2>通行證狀態</h2>
  <p class="lede">
    通行證只存在開啟中的遊樂場頁面；此處僅顯示狀態，不會顯示完整內容。
  </p>
  {#if dash.me?.key}
    <p class="mono">{dash.me.key.prefix}…</p>
    <p class="meta">{formatTime(dash.me.key.created_at)}</p>
  {:else}
    <p class="meta">尚未登入場</p>
  {/if}
  <div class="row">
    <button type="button" disabled={dash.busy} onclick={loginToField}
      >登入我的遊樂場</button
    >
    <button
      type="button"
      class="danger"
      disabled={!dash.me?.key || dash.busy}
      onclick={revokeKey}>撤銷通行證</button
    >
  </div>
</div>

<div class="panel">
  <h2>點數</h2>
  <p class="lede">
    剩餘 <strong>{dash.me?.credits ?? 0}</strong> 點
    {#if dash.me?.turn_hosted}
      · 管理者已開通備援資格
    {:else}
      · 尚未開通備援資格
    {/if}
  </p>
  <div class="prefer-row">
    <label class="prefer">
      <input
        type="checkbox"
        checked={Boolean(dash.me?.turn_prefer)}
        disabled={dash.busy || !dash.me?.turn_hosted}
        onchange={(e) => setTurnPrefer(e.currentTarget.checked)}
      />
      <span>使用連線備援</span>
    </label>
    <p class="meta">
      {#if !dash.me?.turn_hosted}
        需管理者開通後才可啟用。啟用後跨網邀請會自動使用備援（畫面不顯示直連／轉發）。
      {:else if dash.me?.turn_prefer}
        已啟用：點數足夠時會自動使用連線備援。
      {:else}
        已關閉：僅嘗試直連。可隨時再開啟。
      {/if}
    </p>
  </div>
  {#if (dash.me?.credits ?? 0) < 10 && dash.me?.turn_prefer}
    <p class="meta" role="status">額度偏低時，連線備援可能無法使用。</p>
  {/if}
  <h3 class="subh">Session 扣點</h3>
  {#if dash.creditSessions.length === 0}
    <p class="meta">尚無 session 扣點</p>
  {:else}
    <ul class="credit-list">
      {#each dash.creditSessions as row (row.at + String(row.sessionId || ""))}
        <li>
          <span class="mono">{row.delta}</span>
          <span class="meta"
            >{formatTime(row.at)}
            {#if row.reason === "turn_credentials"}
              · 連線備援
            {:else}
              · {row.reason}
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
