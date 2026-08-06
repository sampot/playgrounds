<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { FLEET_3D_COMFORT_NODES } from "./constants.ts";
  import {
    linkColorForKind,
    nodeColorForStatus,
    prefersReducedMotion,
    toFleetGraphData,
    type FleetGraphNode,
  } from "./graphData.ts";
  import type { FleetAgentNode, FleetEdge, FleetEdgeKind } from "./types.ts";

  interface Props {
    nodes: readonly FleetAgentNode[];
    edges: readonly FleetEdge[];
    selectedId?: string | null;
    onSelect?: (agentId: string) => void;
  }

  let { nodes, edges, selectedId = null, onSelect }: Props = $props();

  let containerEl = $state<HTMLDivElement | null>(null);
  let loadError = $state<string | null>(null);
  let loading = $state(false);
  let reduced = $state(false);
  let edgeLineage = $state(true);
  let edgeSession = $state(true);
  let edgeSuccessor = $state(true);
  let edgeTraffic = $state(true);
  let isolateEgo = $state(false);
  let ready = $state(false);

  let graph: {
    graphData: (data: unknown) => unknown;
    nodeColor: (fn?: unknown) => unknown;
    _destructor?: () => void;
    width: (n: number) => unknown;
    height: (n: number) => unknown;
  } | null = null;
  let disposed = false;

  const activeKinds = $derived.by((): FleetEdgeKind[] => {
    const kinds: FleetEdgeKind[] = [];
    if (edgeLineage) kinds.push("lineage");
    if (edgeSession) kinds.push("session");
    if (edgeSuccessor) kinds.push("successor");
    if (edgeTraffic) kinds.push("traffic");
    return kinds;
  });

  function destroyGraph(): void {
    if (graph) {
      try {
        graph._destructor?.();
      } catch {
        /* ignore */
      }
      graph = null;
    }
    if (containerEl) containerEl.innerHTML = "";
    ready = false;
  }

  function applyData(): void {
    if (!graph || !ready) return;
    let viewNodes = [...nodes];
    let viewEdges = [...edges];
    if (isolateEgo && selectedId) {
      const neigh = new Set<string>([selectedId]);
      for (const e of edges) {
        if (e.from === selectedId || e.to === selectedId) {
          neigh.add(e.from);
          neigh.add(e.to);
        }
      }
      for (const e of edges) {
        if (neigh.has(e.from) || neigh.has(e.to)) {
          neigh.add(e.from);
          neigh.add(e.to);
        }
      }
      viewNodes = nodes.filter(n => neigh.has(n.agentId));
      viewEdges = edges.filter(e => neigh.has(e.from) && neigh.has(e.to));
    }
    const sel = selectedId;
    const data = toFleetGraphData(viewNodes, viewEdges, activeKinds);
    graph.graphData(data);
    graph.nodeColor((n: FleetGraphNode) =>
      n.id === sel
        ? "#e8a317"
        : n.poisonCount > 0
          ? "#c45c26"
          : nodeColorForStatus(n.status)
    );
  }

  async function mountGraph(): Promise<void> {
    if (!containerEl || disposed) return;
    reduced = prefersReducedMotion();
    if (reduced) {
      destroyGraph();
      return;
    }
    loading = true;
    loadError = null;
    try {
      const mod = await import("3d-force-graph");
      if (disposed || !containerEl) return;
      const ForceGraph3D = mod.default;
      destroyGraph();
      const width = containerEl.clientWidth || 480;
      const height = Math.max(220, containerEl.clientHeight || 280);
      const g = new ForceGraph3D(containerEl)
        .width(width)
        .height(height)
        .backgroundColor("rgba(0,0,0,0)")
        .showNavInfo(false)
        .nodeId("id")
        .nodeLabel((n: any) => {
          const node = n as FleetGraphNode;
          const parts = [node.name, node.status, `深度 ${node.mailboxDepth}`];
          if (node.poisonCount > 0) parts.push(`毒訊 ${node.poisonCount}`);
          return parts.join(" · ");
        })
        .nodeVal("val")
        .nodeColor((n: any) => {
          const node = n as FleetGraphNode;
          return node.poisonCount > 0
            ? "#c45c26"
            : nodeColorForStatus(node.status);
        })
        .linkColor((l: any) =>
          linkColorForKind((l as { kind: FleetEdgeKind }).kind)
        )
        .linkOpacity(0.6)
        .linkDirectionalArrowLength(2.5)
        .linkDirectionalArrowRelPos(1)
        .onNodeClick((n: any) => {
          onSelect?.((n as FleetGraphNode).id);
        });
      graph = g;
      ready = true;
      applyData();
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      destroyGraph();
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    // Wait a frame so bind:this container has layout.
    const id = requestAnimationFrame(() => {
      void mountGraph();
    });
    return () => cancelAnimationFrame(id);
  });

  onDestroy(() => {
    disposed = true;
    destroyGraph();
  });

  $effect(() => {
    void nodes;
    void edges;
    void activeKinds;
    void isolateEgo;
    void selectedId;
    applyData();
  });
</script>

<div class="flex min-h-0 flex-col gap-2">
  <div class="flex flex-wrap items-center gap-2 text-[10px]">
    <label class="text-skin-base/60 flex items-center gap-1">
      <input type="checkbox" bind:checked={edgeLineage} />
      血統
    </label>
    <label class="text-skin-base/60 flex items-center gap-1">
      <input type="checkbox" bind:checked={edgeSession} />
      Session
    </label>
    <label class="text-skin-base/60 flex items-center gap-1">
      <input type="checkbox" bind:checked={edgeSuccessor} />
      接班
    </label>
    <label class="text-skin-base/60 flex items-center gap-1">
      <input type="checkbox" bind:checked={edgeTraffic} />
      通訊
    </label>
    <label class="text-skin-base/60 flex items-center gap-1">
      <input
        type="checkbox"
        bind:checked={isolateEgo}
        disabled={!selectedId}
      />
      Isolate 鄰域
    </label>
    {#if nodes.length > FLEET_3D_COMFORT_NODES}
      <span class="text-skin-accent font-semibold">
        {nodes.length} 節點偏多，建議 Isolate 或篩選
      </span>
    {/if}
  </div>

  {#if reduced}
    <p class="text-skin-base/50 text-[11px] leading-relaxed">
      已偵測到 prefers-reduced-motion：停用 3D。請改用「血統／Session／編排」視圖。
    </p>
  {:else if loadError}
    <p class="text-skin-accent text-[11px]" role="alert">
      無法載入 3D 圖：{loadError}
    </p>
  {:else}
    <div
      bind:this={containerEl}
      class="border-skin-line bg-skin-card/30 relative h-[min(40vh,20rem)] min-h-[14rem] w-full overflow-hidden rounded-md border"
      aria-label="Agent 關係 3D 圖"
    >
      {#if loading}
        <p
          class="text-skin-base/45 absolute inset-0 z-10 flex items-center justify-center text-[11px]"
        >
          載入 3D 引擎…
        </p>
      {/if}
    </div>
    <p class="text-skin-base/40 text-[10px]">
      拖曳旋轉、滾輪縮放；點節點選取。離開此分頁會卸載 WebGL。
    </p>
  {/if}
</div>
