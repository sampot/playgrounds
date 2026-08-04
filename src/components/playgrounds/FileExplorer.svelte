<script lang="ts">
  import type { FileTreeNode } from "./pathUtils";
  import PgIcon from "./PgIcon.svelte";

  interface Props {
    nodes: FileTreeNode[];
    openPath: string | null;
    selectedPath: string | null;
    entryPath?: string | null;
    expanded: Record<string, boolean>;
    depth?: number;
    /** Disable selection actions (busy / no project). */
    selectionActionsDisabled?: boolean;
    onSelectFile: (path: string) => void;
    onSelectDir: (path: string) => void;
    onToggleDir: (path: string) => void;
    onDownloadSelection?: () => void;
    onRenameSelection?: () => void;
    onDeleteSelection?: () => void;
  }

  let {
    nodes,
    openPath,
    selectedPath,
    entryPath = null,
    expanded,
    depth = 0,
    selectionActionsDisabled = false,
    onSelectFile,
    onSelectDir,
    onToggleDir,
    onDownloadSelection,
    onRenameSelection,
    onDeleteSelection,
  }: Props = $props();

  const rowBtn =
    "text-skin-base/45 hover:text-skin-base inline-flex h-6 w-6 shrink-0 items-center justify-center rounded disabled:opacity-40";
</script>

<ul
  class="playgrounds-file-tree m-0 list-none space-y-px p-0 font-mono text-[11px]"
  role={depth === 0 ? "tree" : "group"}
>
  {#each nodes as node (node.path)}
    {@const selected = selectedPath === node.path}
    <li role="treeitem" aria-expanded={node.kind === "dir" ? !!expanded[node.path] : undefined}>
      {#if node.kind === "dir"}
        <div
          class="flex w-full items-stretch rounded hover:bg-skin-card {selected
            ? 'bg-skin-card text-skin-accent'
            : 'text-skin-base/85'}"
          style={`padding-left: ${6 + depth * 12}px`}
        >
          <button
            type="button"
            class="text-skin-base/45 hover:text-skin-base w-5 shrink-0 px-0.5 text-[10px]"
            aria-label={expanded[node.path] ? "收合" : "展開"}
            onclick={e => {
              e.stopPropagation();
              onToggleDir(node.path);
            }}
          >
            {expanded[node.path] ? "▾" : "▸"}
          </button>
          <button
            type="button"
            class="min-w-0 flex-1 truncate py-1 pr-1 text-left"
            onclick={() => onSelectDir(node.path)}
            title={node.path}
          >
            {node.name}/
          </button>
          {#if selected && (onDownloadSelection || onRenameSelection || onDeleteSelection)}
            <div class="flex shrink-0 items-center gap-0.5 pr-0.5">
              {#if onDownloadSelection}
                <button
                  type="button"
                  class={rowBtn}
                  disabled={selectionActionsDisabled}
                  title="下載（資料夾打包 ZIP）"
                  aria-label="下載"
                  onclick={e => {
                    e.stopPropagation();
                    onDownloadSelection();
                  }}><PgIcon name="download" size={12} /></button
                >
              {/if}
              {#if onRenameSelection}
                <button
                  type="button"
                  class={rowBtn}
                  disabled={selectionActionsDisabled}
                  title="改名"
                  aria-label="改名"
                  onclick={e => {
                    e.stopPropagation();
                    onRenameSelection();
                  }}><PgIcon name="pencil" size={12} /></button
                >
              {/if}
              {#if onDeleteSelection}
                <button
                  type="button"
                  class={rowBtn}
                  disabled={selectionActionsDisabled}
                  title="刪除"
                  aria-label="刪除"
                  onclick={e => {
                    e.stopPropagation();
                    onDeleteSelection();
                  }}><PgIcon name="trash" size={12} /></button
                >
              {/if}
            </div>
          {/if}
        </div>
        {#if expanded[node.path]}
          <svelte:self
            nodes={node.children}
            {openPath}
            {selectedPath}
            {entryPath}
            {expanded}
            depth={depth + 1}
            {selectionActionsDisabled}
            {onSelectFile}
            {onSelectDir}
            {onToggleDir}
            {onDownloadSelection}
            {onRenameSelection}
            {onDeleteSelection}
          />
        {/if}
      {:else}
        {@const fileHighlighted = openPath === node.path || selected}
        {@const showFileActions = selectedPath === node.path}
        <div
          class="flex w-full items-stretch rounded hover:bg-skin-card {fileHighlighted
            ? 'bg-skin-card text-skin-accent'
            : 'text-skin-base/85'} {entryPath === node.path ? 'font-semibold' : ''}"
          style={`padding-left: ${10 + depth * 12}px`}
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1 py-1 pr-1 text-left"
            onclick={() => onSelectFile(node.path)}
            title={node.path}
          >
            <span class="text-skin-base/35 w-3 shrink-0 text-[10px]"
              >{entryPath === node.path ? "★" : "·"}</span
            >
            <span class="truncate">{node.name}</span>
          </button>
          {#if showFileActions && (onDownloadSelection || onRenameSelection || onDeleteSelection)}
            <div class="flex shrink-0 items-center gap-0.5 pr-0.5">
              {#if onDownloadSelection}
                <button
                  type="button"
                  class={rowBtn}
                  disabled={selectionActionsDisabled}
                  title="下載"
                  aria-label="下載"
                  onclick={e => {
                    e.stopPropagation();
                    onDownloadSelection();
                  }}><PgIcon name="download" size={12} /></button
                >
              {/if}
              {#if onRenameSelection}
                <button
                  type="button"
                  class={rowBtn}
                  disabled={selectionActionsDisabled}
                  title="改名"
                  aria-label="改名"
                  onclick={e => {
                    e.stopPropagation();
                    onRenameSelection();
                  }}><PgIcon name="pencil" size={12} /></button
                >
              {/if}
              {#if onDeleteSelection}
                <button
                  type="button"
                  class={rowBtn}
                  disabled={selectionActionsDisabled}
                  title="刪除"
                  aria-label="刪除"
                  onclick={e => {
                    e.stopPropagation();
                    onDeleteSelection();
                  }}><PgIcon name="trash" size={12} /></button
                >
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </li>
  {/each}
</ul>
