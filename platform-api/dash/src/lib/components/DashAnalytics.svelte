<script lang="ts">
  import { dash } from "$lib/dash.svelte";
  import type { GameAnalyticsRow } from "$lib/api";

  let analyticsRows = $state<GameAnalyticsRow[]>([]);
  let analyticsFilter = $state<"all" | "listed" | "unlisted">("all");
  let analyticsDays = $state<number>(30);

  async function loadAnalytics() {
    const res = await fetch(`/v1/analytics/games?days=${analyticsDays}`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      analyticsRows = [];
      dash.flash(data.error || "無法載入分析", "err");
      return;
    }
    analyticsRows = data.days || data.games || [];
  }

  $effect(() => {
    if (dash.isAdmin) void loadAnalytics();
  });
</script>

<div class="panel">
  <h2>分析</h2>
  <p class="lede">
    純玩 `/s/` 的遊玩統計（含 unlisted，皆不計原始 session）。
  </p>
  <div class="row wrap">
    <div class="seg" role="group" aria-label="listed 篩選">
      <button
        type="button"
        class="seg-btn {analyticsFilter === 'all' ? 'seg-on' : ''}"
        onclick={() => (analyticsFilter = "all")}>全部</button
      >
      <button
        type="button"
        class="seg-btn {analyticsFilter === 'listed' ? 'seg-on' : ''}"
        onclick={() => (analyticsFilter = "listed")}>listed</button
      >
      <button
        type="button"
        class="seg-btn {analyticsFilter === 'unlisted' ? 'seg-on' : ''}"
        onclick={() => (analyticsFilter = "unlisted")}>unlisted</button
      >
    </div>
    <label class="meta">
      近 <input
        type="number"
        class="num"
        min="1"
        max="90"
        bind:value={analyticsDays}
        onchange={() => void loadAnalytics()}
      />
      天
    </label>
    <button type="button" class="secondary" onclick={() => void loadAnalytics()}
      >重新整理</button
    >
  </div>
</div>

<div class="panel">
  {#if analyticsRows.length === 0}
    <p class="meta">尚無遊玩資料。</p>
  {:else}
    <div class="table-wrap">
      <table class="analtable">
        <thead>
          <tr>
            <th scope="col">小品</th>
            <th scope="col">plays</th>
            <th scope="col">態勢</th>
            <th scope="col">avg(sec)</th>
            <th scope="col">DAU</th>
          </tr>
        </thead>
        <tbody>
          {#each analyticsRows.filter(
            (r) => analyticsFilter === "all" || analyticsFilter === "listed" === r.listed
          ) as row (row.day + row.catalog_id)}
            <tr>
              <td>
                <span class="mono">{row.catalog_id}</span>
                {#if !row.listed}
                  <span class="badge">未列入</span>
                {/if}
                {#if row.day}
                  <span class="meta"><br />{row.day}</span>
                {/if}
              </td>
              <td class="num-td">{row.plays}</td>
              <td class="num-td">{row.unique_sessions ?? "—"}</td>
              <td class="num-td">{row.avg_duration_sec}</td>
              <td class="num-td">{row.dauc ?? "—"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
