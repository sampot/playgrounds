<script lang="ts">
  import type { MailboxMessageHeader } from "../../../sam-runtime/index.ts";
  import { getAgentRuntimeHub } from "../agentRuntimeHub";
  import PgIcon from "../PgIcon.svelte";
  import FleetGraph3D from "./FleetGraph3D.svelte";
  import {
    FLEET_RECENT_MSG_HEADERS,
    buildSessionGroups,
    buildSupervisorFanouts,
    filterFleetNodes,
    flattenLineage,
    focusRelations,
    loadFleetSnapshot,
    type FleetAgentNode,
    type FleetAttentionItem,
    type FleetSnapshot,
    type LoadFleetSnapshotArgs,
  } from "./index.ts";

  interface Props {
    projects: LoadFleetSnapshotArgs["projects"];
    activeSessionSeatIds?: ReadonlySet<string>;
    sessionIdBySandbox?: ReadonlyMap<string, string>;
    activeAgentSandboxId: string | null;
    busy?: boolean;
    onOpen?: (sandboxId: string) => void | Promise<void>;
    onSetWorkingSet?: (
      sandboxId: string,
      inWorkingSet: boolean
    ) => void | Promise<void>;
    onDelete?: (sandboxId: string) => void | Promise<void>;
  }

  let {
    projects,
    activeSessionSeatIds,
    sessionIdBySandbox,
    activeAgentSandboxId,
    busy = false,
    onOpen,
    onSetWorkingSet,
    onDelete,
  }: Props = $props();

  type RelationView =
    | "list"
    | "lineage"
    | "session"
    | "supervisor"
    | "graph3d";

  const btn =
    "inline-flex items-center justify-center rounded-md border border-skin-line bg-skin-card px-2 py-1 text-xs font-medium text-skin-base transition hover:bg-skin-card disabled:opacity-40";

  let snapshot = $state<FleetSnapshot | null>(null);
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let filter = $state("");
  let selectedId = $state<string | null>(null);
  let headers = $state<MailboxMessageHeader[]>([]);
  let headersLoading = $state(false);
  let egoOnly = $state(false);
  let includeTraffic = $state(false);
  let poisonBusy = $state(false);
  let relationView = $state<RelationView>("list");
  let lineageExpandKeys = $state<string[]>([]);

  const selected = $derived(
    snapshot?.nodes.find(n => n.agentId === selectedId) ?? null
  );

  const filteredNodes = $derived(
    filterFleetNodes(snapshot?.nodes ?? [], filter)
  );

  const lineageRows = $derived(
    flattenLineage(filteredNodes, {
      expandKeys: new Set(lineageExpandKeys),
    })
  );

  const sessionGroups = $derived(
    buildSessionGroups(filteredNodes, {
      activeSessionSeatIds,
    })
  );

  const supervisorFanouts = $derived(
    buildSupervisorFanouts(filteredNodes, snapshot?.edges ?? [], {
      stewardAgentId: activeAgentSandboxId,
    })
  );

  const selectedRelations = $derived(
    selectedId
      ? focusRelations(selectedId, snapshot?.nodes ?? [], snapshot?.edges ?? [])
      : null
  );

  async function refresh(): Promise<void> {
    loading = true;
    loadError = null;
    try {
      snapshot = await loadFleetSnapshot({
        projects,
        activeSessionSeatIds,
        sessionIdBySandbox,
        opts: {
          includeTraffic,
          ...(egoOnly && selectedId
            ? { egoAgentId: selectedId, egoHops: 2 }
            : {}),
        },
      });
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      snapshot = null;
    } finally {
      loading = false;
    }
  }

  async function selectAgent(agentId: string): Promise<void> {
    selectedId = agentId;
    headersLoading = true;
    headers = [];
    try {
      const hub = await getAgentRuntimeHub();
      headers = await hub.runtime.mailbox.listMessageHeaders(
        agentId,
        FLEET_RECENT_MSG_HEADERS
      );
    } catch {
      headers = [];
    } finally {
      headersLoading = false;
    }
  }

  async function onAttentionClick(item: FleetAttentionItem): Promise<void> {
    await selectAgent(item.agentId);
  }

  async function discardPoison(messageId: string): Promise<void> {
    if (!selectedId) return;
    poisonBusy = true;
    try {
      const hub = await getAgentRuntimeHub();
      await hub.runtime.mailbox.discardPoison(selectedId, messageId);
      await selectAgent(selectedId);
      await refresh();
    } finally {
      poisonBusy = false;
    }
  }

  async function requeuePoison(messageId: string): Promise<void> {
    if (!selectedId) return;
    poisonBusy = true;
    try {
      const hub = await getAgentRuntimeHub();
      await hub.runtime.mailbox.requeuePoison(selectedId, messageId);
      void import("../backendHost").then(m => m.backendKickDrain());
      void hub.runtime.kickDrain();
      await selectAgent(selectedId);
      await refresh();
    } finally {
      poisonBusy = false;
    }
  }

  function toggleLineageExpand(parentId: string): void {
    if (lineageExpandKeys.includes(parentId)) {
      lineageExpandKeys = lineageExpandKeys.filter(k => k !== parentId);
    } else {
      lineageExpandKeys = [...lineageExpandKeys, parentId];
    }
  }

  function statusLabel(status: FleetAgentNode["status"]): string {
    switch (status) {
      case "running":
        return "運作中";
      case "hibernated":
        return "休眠";
      case "stopped":
        return "已停";
      default:
        return "已登記";
    }
  }

  function attentionLabel(reason: FleetAttentionItem["reason"]): string {
    switch (reason) {
      case "poison":
        return "毒訊息";
      case "mailbox_pressure":
        return "壅塞";
      case "stale_session_seat":
        return "殘留座位";
      case "app_health":
        return "應用健康";
      case "orphan":
        return "孤兒";
      case "stuck":
        return "卡住";
      default:
        return reason;
    }
  }

  function intentLabel(intent: string | undefined): string {
    switch (intent) {
      case "user":
        return "人手";
      case "steward_for_user":
        return "代建";
      case "self_upgrade":
        return "自迭代";
      case "session_seat":
        return "座位";
      case "roster_avatar":
        return "化身";
      case "experiment":
        return "試驗";
      default:
        return intent ?? "";
    }
  }

  function agentRowClass(agentId: string): string {
    return selectedId === agentId
      ? "bg-skin-accent/15"
      : "hover:bg-skin-card/60";
  }

  $effect(() => {
    void projects;
    void activeSessionSeatIds;
    void sessionIdBySandbox;
    void refresh();
  });
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3">
  <div class="flex flex-wrap items-center gap-2">
    <p class="text-skin-base/50 flex-1 text-[11px] leading-relaxed">
      掌握 Agent 運行態與關係。休眠是省資源，不是故障。
    </p>
    <button
      type="button"
      class="{btn} text-[11px]"
      disabled={loading || busy}
      onclick={() => void refresh()}
    >
      <PgIcon name="refresh" size={12} />
      <span class="ml-1">{loading ? "更新中…" : "重新整理"}</span>
    </button>
  </div>

  {#if loadError}
    <p class="text-skin-accent text-xs" role="alert">{loadError}</p>
  {/if}

  {#if snapshot}
    {@const c = snapshot.counts}
    {@const p = snapshot.pressure}
    <div
      class="border-skin-line grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-4"
      aria-label="Fleet Pulse"
    >
      <div class="text-[11px]">
        <div class="text-skin-base/45">運作／休眠</div>
        <div class="font-semibold tabular-nums">
          {c.running}／{c.hibernated}
        </div>
      </div>
      <div class="text-[11px]">
        <div class="text-skin-base/45">登記／已停</div>
        <div class="font-semibold tabular-nums">
          {c.registered}／{c.stopped}
        </div>
      </div>
      <div class="text-[11px]">
        <div class="text-skin-base/45">佇列／近滿／毒訊</div>
        <div class="font-semibold tabular-nums">
          {p.mailboxDepthTotal}／{p.nearFullCount}／{p.poisonTotal}
        </div>
      </div>
      <div class="text-[11px]">
        <div class="text-skin-base/45">Leader</div>
        <div class="font-semibold">
          {snapshot.leader.isLeader ? "本頁" : "外接螢幕"}
          <span class="text-skin-base/45 font-normal">
            · epoch {snapshot.leader.epoch}
          </span>
        </div>
      </div>
    </div>

    {#if snapshot.attention.length > 0}
      <div>
        <h3
          class="text-skin-base/45 mb-1 text-[10px] font-semibold tracking-wider uppercase"
        >
          Needs attention
        </h3>
        <ul
          class="border-skin-line max-h-28 space-y-0.5 overflow-auto rounded-md border p-1"
        >
          {#each snapshot.attention as item (item.agentId + item.reason)}
            <li>
              <button
                type="button"
                class="hover:bg-skin-card flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px]"
                onclick={() => void onAttentionClick(item)}
              >
                <span
                  class="rounded px-1 py-0.5 text-[9px] font-semibold {item.severity ===
                  'error'
                    ? 'bg-skin-accent/15 text-skin-accent'
                    : 'bg-black/5 text-skin-base/70 dark:bg-white/10'}"
                >
                  {attentionLabel(item.reason)}
                </span>
                <span class="truncate font-medium">{item.agentId}</span>
                {#if item.detail}
                  <span class="text-skin-base/45 truncate">{item.detail}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="text-skin-base/40 text-[11px]">目前沒有需要注意的項目。</p>
    {/if}
  {/if}

  <div class="flex min-h-0 flex-1 flex-col gap-2 sm:flex-row">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-[10rem] flex-1">
          <label class="sr-only" for="fleet-filter">搜尋 Agent</label>
          <input
            id="fleet-filter"
            class="border-skin-line bg-skin-fill focus:border-skin-accent h-8 w-full rounded-md border px-2 text-xs outline-none"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="名稱／id／狀態／意圖…"
            bind:value={filter}
          />
        </div>
        <label class="text-skin-base/60 flex items-center gap-1 text-[10px]">
          <input
            type="checkbox"
            checked={egoOnly}
            disabled={!selectedId}
            onchange={e => {
              const el = e.currentTarget;
              if (el instanceof HTMLInputElement) {
                egoOnly = el.checked;
                void refresh();
              }
            }}
          />
          只看選中鄰域
        </label>
        <label class="text-skin-base/60 flex items-center gap-1 text-[10px]">
          <input
            type="checkbox"
            checked={includeTraffic}
            onchange={e => {
              const el = e.currentTarget;
              if (el instanceof HTMLInputElement) {
                includeTraffic = el.checked;
                void refresh();
              }
            }}
          />
          通訊熱邊
        </label>
      </div>

      <div
        class="flex flex-wrap gap-1"
        role="tablist"
        aria-label="關係視圖"
      >
        {#each [
          { id: "list" as const, label: "列表" },
          { id: "lineage" as const, label: "血統" },
          { id: "session" as const, label: "Session" },
          { id: "supervisor" as const, label: "編排" },
          { id: "graph3d" as const, label: "3D" },
        ] as tab (tab.id)}
          <button
            type="button"
            role="tab"
            aria-selected={relationView === tab.id}
            class="rounded px-2 py-1 text-[11px] {relationView === tab.id
              ? 'bg-skin-accent/15 text-skin-accent font-semibold'
              : 'text-skin-base/60 hover:bg-skin-card'}"
            onclick={() => (relationView = tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </div>

      <div
        class="border-skin-line min-h-[8rem] flex-1 space-y-0.5 overflow-auto rounded-md border p-1"
        role="listbox"
        aria-label="Agent 關係視圖"
      >
        {#if relationView === "graph3d"}
          {#if !snapshot || filteredNodes.length === 0}
            <p class="text-skin-base/45 px-2 py-3 text-center text-xs">
              {loading ? "載入中…" : "沒有節點可繪製"}
            </p>
          {:else}
            <div class="p-1">
              <FleetGraph3D
                nodes={filteredNodes}
                edges={snapshot.edges}
                {selectedId}
                onSelect={id => void selectAgent(id)}
              />
            </div>
          {/if}
        {:else if !snapshot || filteredNodes.length === 0}
          <p class="text-skin-base/45 px-2 py-3 text-center text-xs">
            {loading ? "載入中…" : "沒有符合的 Agent（registry 為空或被篩掉）"}
          </p>
        {:else if relationView === "list"}
          <ul class="space-y-0.5">
            {#each filteredNodes as n (n.agentId)}
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedId === n.agentId}
                  class="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-[11px] {agentRowClass(
                    n.agentId
                  )}"
                  onclick={() => void selectAgent(n.agentId)}
                >
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="truncate font-medium">{n.name}</span>
                  {#if n.ui?.roleLabel}
                    <span
                      class="bg-skin-accent/15 text-skin-accent rounded px-1 text-[9px] font-semibold"
                      >{n.ui.roleLabel}</span
                    >
                  {/if}
                  {#if n.ui?.health === "error" || n.ui?.health === "warn"}
                    <span
                      class="rounded px-1 text-[9px] font-semibold {n.ui
                        .health === 'error'
                        ? 'bg-skin-accent/15 text-skin-accent'
                        : 'bg-black/5 text-skin-base/70 dark:bg-white/10'}"
                      >{n.ui.health}</span
                    >
                  {/if}
                  <span class="text-skin-base/45">{statusLabel(n.status)}</span>
                  {#if n.cloneIntent}
                    <span
                      class="text-skin-base/45 rounded bg-black/5 px-1 text-[9px] dark:bg-white/10"
                      >{intentLabel(n.cloneIntent)}</span
                    >
                  {/if}
                  {#if n.poisonCount > 0}
                    <span class="text-skin-accent text-[9px] font-semibold"
                      >毒訊 {n.poisonCount}</span
                    >
                  {/if}
                  {#if n.mailboxDepth > 0}
                    <span class="text-skin-base/45 text-[9px]"
                      >深度 {n.mailboxDepth}</span
                    >
                  {/if}
                </div>
                <span class="text-skin-base/40 truncate text-[10px]"
                  >{n.agentId}</span
                >
              </button>
            </li>
          {/each}
          </ul>
        {:else if relationView === "lineage"}
          <ul class="space-y-0.5">
            {#each lineageRows as row, i (row.type === "agent"
              ? row.node!.agentId
              : `c-${row.collapseKey}-${i}`)}
              {#if row.type === "agent" && row.node}
                {@const n = row.node}
                <li style="padding-left: {row.depth * 0.75}rem">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedId === n.agentId}
                    class="flex w-full flex-col gap-0.5 rounded px-2 py-1 text-left text-[11px] {agentRowClass(
                      n.agentId
                    )}"
                    onclick={() => void selectAgent(n.agentId)}
                  >
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="text-skin-base/30" aria-hidden="true"
                        >{row.depth > 0 ? "└" : "•"}</span
                      >
                      <span class="truncate font-medium">{n.name}</span>
                      <span class="text-skin-base/45"
                        >{statusLabel(n.status)}</span
                      >
                      {#if n.cloneIntent}
                        <span
                          class="text-skin-base/45 rounded bg-black/5 px-1 text-[9px] dark:bg-white/10"
                          >{intentLabel(n.cloneIntent)}</span
                        >
                      {/if}
                    </div>
                  </button>
                </li>
              {:else if row.type === "collapsed" && row.collapseKey}
                <li style="padding-left: {row.depth * 0.75}rem">
                  <button
                    type="button"
                    class="text-skin-base/55 hover:bg-skin-card/60 w-full rounded px-2 py-1 text-left text-[11px]"
                    onclick={() => toggleLineageExpand(row.collapseKey!)}
                  >
                    └ +{row.collapsedCount} 休眠（展開）
                  </button>
                </li>
              {/if}
            {/each}
          </ul>
        {:else if relationView === "session"}
          {#if sessionGroups.length === 0}
            <p class="text-skin-base/45 px-2 py-3 text-center text-xs">
              目前沒有 session 群組或殘留座位
            </p>
          {:else}
            <div class="space-y-2 p-1">
              {#each sessionGroups as g (g.sessionId ?? "residual")}
                <section
                  class="border-skin-line/70 rounded-md border p-2"
                  aria-label={g.label}
                >
                  <div class="mb-1 flex flex-wrap items-center gap-1.5">
                    <span class="text-xs font-semibold">{g.label}</span>
                    {#if g.stale}
                      <span
                        class="bg-skin-accent/15 text-skin-accent rounded px-1 text-[9px] font-semibold"
                        >可 GC</span
                      >
                    {/if}
                    <span class="text-skin-base/40 text-[10px]">
                      {g.members.length} 席 · 深度 {g.mailboxDepthTotal}
                      {#if g.poisonTotal > 0}
                        · 毒訊 {g.poisonTotal}
                      {/if}
                    </span>
                  </div>
                  <ul class="space-y-0.5">
                    {#each g.members as n (n.agentId)}
                      <li>
                        <button
                          type="button"
                          class="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] {agentRowClass(
                            n.agentId
                          )}"
                          onclick={() => void selectAgent(n.agentId)}
                        >
                          <span class="truncate font-medium">{n.name}</span>
                          <span class="text-skin-base/45"
                            >{statusLabel(n.status)}</span
                          >
                        </button>
                      </li>
                    {/each}
                  </ul>
                </section>
              {/each}
            </div>
          {/if}
        {:else}
          <!-- supervisor -->
          {#if supervisorFanouts.length === 0}
            <p class="text-skin-base/45 px-2 py-3 text-center text-xs">
              尚無編排扇出（無總管／無血統子代）
            </p>
          {:else}
            <div class="space-y-2 p-1">
              {#each supervisorFanouts as f (f.hub.agentId)}
                <section
                  class="border-skin-line/70 rounded-md border p-2"
                  aria-label="編排 {f.hub.name}"
                >
                  <button
                    type="button"
                    class="mb-1 flex w-full flex-wrap items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] {agentRowClass(
                      f.hub.agentId
                    )}"
                    onclick={() => void selectAgent(f.hub.agentId)}
                  >
                    <span
                      class="bg-skin-accent/15 text-skin-accent rounded px-1 text-[9px] font-semibold"
                      >中心</span
                    >
                    <span class="truncate font-semibold">{f.hub.name}</span>
                    {#if f.hub.agentId === activeAgentSandboxId}
                      <span class="text-skin-base/45 text-[9px]">總管</span>
                    {/if}
                    <span class="text-skin-base/45"
                      >{statusLabel(f.hub.status)}</span
                    >
                  </button>
                  {#if f.successors.length > 0}
                    <ul class="text-skin-base/55 mb-1 space-y-0.5 pl-2 text-[10px]">
                      {#each f.successors as s (`${s.from.agentId}->${s.to.agentId}`)}
                        <li>
                          <button
                            type="button"
                            class="hover:text-skin-base"
                            onclick={() => void selectAgent(s.from.agentId)}
                            >{s.from.name}</button
                          >
                          <span> → succeeded by → </span>
                          <button
                            type="button"
                            class="hover:text-skin-base"
                            onclick={() => void selectAgent(s.to.agentId)}
                            >{s.to.name}</button
                          >
                        </li>
                      {/each}
                    </ul>
                  {/if}
                  {#if f.workers.length === 0}
                    <p class="text-skin-base/40 pl-1 text-[10px]">無直接工人</p>
                  {:else}
                    <ul class="space-y-0.5 pl-1">
                      {#each f.workers as w (w.agentId)}
                        <li>
                          <button
                            type="button"
                            class="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] {agentRowClass(
                              w.agentId
                            )}"
                            onclick={() => void selectAgent(w.agentId)}
                          >
                            <span class="text-skin-base/30" aria-hidden="true"
                              >└</span
                            >
                            <span class="truncate font-medium">{w.name}</span>
                            <span class="text-skin-base/45"
                              >{statusLabel(w.status)}</span
                            >
                            {#if w.cloneIntent}
                              <span
                                class="text-skin-base/45 rounded bg-black/5 px-1 text-[9px] dark:bg-white/10"
                                >{intentLabel(w.cloneIntent)}</span
                              >
                            {/if}
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </section>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <aside
      class="border-skin-line flex min-h-[10rem] w-full flex-col gap-2 overflow-auto rounded-md border p-2 sm:w-[15rem] sm:shrink-0"
      aria-label="Agent Focus"
    >
      {#if !selected}
        <p class="text-skin-base/45 text-[11px]">選一個 Agent 查看詳情。</p>
      {:else}
        <div>
          <div class="truncate text-xs font-semibold">{selected.name}</div>
          <div class="text-skin-base/40 truncate text-[10px]">
            {selected.agentId}
          </div>
          {#if selected.ui?.roleLabel}
            <div class="text-skin-accent mt-0.5 text-[10px] font-semibold">
              {selected.ui.roleLabel}
            </div>
          {/if}
        </div>
        <dl
          class="text-skin-base/70 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]"
        >
          <dt class="text-skin-base/45">狀態</dt>
          <dd>{statusLabel(selected.status)}</dd>
          {#if selected.ui?.health}
            <dt class="text-skin-base/45">健康</dt>
            <dd>
              {selected.ui.health}{selected.ui.healthDetail
                ? ` · ${selected.ui.healthDetail}`
                : ""}
            </dd>
          {/if}
          <dt class="text-skin-base/45">佇列</dt>
          <dd>
            {selected.mailboxDepth}{selected.inFlight ? "（處理中）" : ""}
          </dd>
          <dt class="text-skin-base/45">毒訊</dt>
          <dd>{selected.poisonCount}</dd>
          <dt class="text-skin-base/45">Alarm</dt>
          <dd>{selected.alarmPendingCount ?? 0}</dd>
          <dt class="text-skin-base/45">工作集</dt>
          <dd>{selected.inWorkingSet ? "是" : "否"}</dd>
          {#if selected.cloneIntent}
            <dt class="text-skin-base/45">意圖</dt>
            <dd>{intentLabel(selected.cloneIntent)}</dd>
          {/if}
        </dl>

        {#if selectedRelations}
          <div>
            <h4
              class="text-skin-base/45 mb-1 text-[10px] font-semibold tracking-wider uppercase"
            >
              關係
            </h4>
            <ul class="space-y-0.5 text-[10px]">
              {#if selectedRelations.parent}
                <li>
                  <span class="text-skin-base/45">父 </span>
                  <button
                    type="button"
                    class="text-skin-accent hover:underline"
                    onclick={() =>
                      void selectAgent(selectedRelations.parent!.agentId)}
                    >{selectedRelations.parent.name}</button
                  >
                </li>
              {/if}
              {#if selectedRelations.predecessor}
                <li>
                  <span class="text-skin-base/45">接替 </span>
                  <button
                    type="button"
                    class="text-skin-accent hover:underline"
                    onclick={() =>
                      void selectAgent(selectedRelations.predecessor!.agentId)}
                    >{selectedRelations.predecessor.name}</button
                  >
                </li>
              {/if}
              {#if selectedRelations.children.length > 0}
                <li>
                  <span class="text-skin-base/45"
                    >子（{selectedRelations.children.length}）</span
                  >
                  <div class="mt-0.5 flex flex-col gap-0.5 pl-1">
                    {#each selectedRelations.children.slice(0, 8) as c (c.agentId)}
                      <button
                        type="button"
                        class="truncate text-left hover:underline"
                        onclick={() => void selectAgent(c.agentId)}
                        >{c.name}</button
                      >
                    {/each}
                    {#if selectedRelations.children.length > 8}
                      <span class="text-skin-base/40"
                        >+{selectedRelations.children.length - 8} 更多</span
                      >
                    {/if}
                  </div>
                </li>
              {/if}
              {#if selectedRelations.sessionPeers.length > 0}
                <li>
                  <span class="text-skin-base/45"
                    >Session 同伴（{selectedRelations.sessionPeers
                      .length}）</span
                  >
                  <div class="mt-0.5 flex flex-col gap-0.5 pl-1">
                    {#each selectedRelations.sessionPeers.slice(0, 6) as p (p.agentId)}
                      <button
                        type="button"
                        class="truncate text-left hover:underline"
                        onclick={() => void selectAgent(p.agentId)}
                        >{p.name}</button
                      >
                    {/each}
                  </div>
                </li>
              {/if}
              {#if selectedRelations.succeededBy.length > 0}
                <li>
                  <span class="text-skin-base/45">被接班 </span>
                  {#each selectedRelations.succeededBy as s (s.agentId)}
                    <button
                      type="button"
                      class="text-skin-accent hover:underline"
                      onclick={() => void selectAgent(s.agentId)}>{s.name}</button
                    >
                  {/each}
                </li>
              {/if}
              {#if !selectedRelations.parent &&
                selectedRelations.children.length === 0 &&
                selectedRelations.sessionPeers.length === 0 &&
                selectedRelations.succeededBy.length === 0 &&
                !selectedRelations.predecessor}
                <li class="text-skin-base/40">無已知鄰居</li>
              {/if}
            </ul>
          </div>
        {/if}

        <div class="flex flex-wrap gap-1">
          <button
            type="button"
            class="{btn} text-[10px]"
            disabled={busy}
            onclick={() => void onOpen?.(selected.sandboxId)}
          >
            開啟
          </button>
          <button
            type="button"
            class="{btn} text-[10px]"
            disabled={busy}
            onclick={() =>
              void onSetWorkingSet?.(
                selected.sandboxId,
                !selected.inWorkingSet
              )}
          >
            {selected.inWorkingSet ? "移出工作集" : "加入工作集"}
          </button>
          <button
            type="button"
            class="{btn} text-skin-accent text-[10px]"
            disabled={busy || selected.sandboxId === activeAgentSandboxId}
            onclick={() => void onDelete?.(selected.sandboxId)}
          >
            刪除
          </button>
        </div>
        <div>
          <h4
            class="text-skin-base/45 mb-1 text-[10px] font-semibold tracking-wider uppercase"
          >
            最近訊息
          </h4>
          {#if headersLoading}
            <p class="text-skin-base/40 text-[10px]">載入中…</p>
          {:else if headers.length === 0}
            <p class="text-skin-base/40 text-[10px]">無待處理／毒訊息</p>
          {:else}
            <ul class="max-h-40 space-y-1 overflow-auto">
              {#each headers as h (h.id + h.state)}
                <li
                  class="border-skin-line/50 rounded border px-1.5 py-1 text-[10px]"
                >
                  <div class="flex flex-wrap items-center gap-1">
                    <span class="font-medium">{h.type}</span>
                    <span class="text-skin-base/40">{h.state}</span>
                  </div>
                  <div class="text-skin-base/40 truncate">
                    {h.from} → {h.to}
                  </div>
                  {#if h.state === "poison"}
                    <div class="mt-0.5 flex gap-1">
                      <button
                        type="button"
                        class="{btn} text-[9px]"
                        disabled={poisonBusy}
                        onclick={() => void requeuePoison(h.id)}
                      >
                        重放
                      </button>
                      <button
                        type="button"
                        class="{btn} text-skin-accent text-[9px]"
                        disabled={poisonBusy}
                        onclick={() => void discardPoison(h.id)}
                      >
                        丟棄
                      </button>
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </aside>
  </div>
</div>
