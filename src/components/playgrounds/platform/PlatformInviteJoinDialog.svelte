<script lang="ts">
  import type { PlatformInviteJoinPayload } from "./platformInviteJoinShell";
  import { composeSessionProtocol } from "./platformCompose";
  import {
    INVITE_STORAGE_RESTRICTED_LEAD,
    INVITE_STORAGE_RESTRICTED_TITLE,
  } from "../storageErrors";

  let {
    open = $bindable(false),
    payload = $bindable<PlatformInviteJoinPayload | null>(null),
    pending = $bindable(false),
    error = $bindable<string | null>(null),
    recovery = $bindable<"open_in_safari" | null>(null),
    copyUrl = $bindable<string | null>(null),
    busy = $bindable(false),
    status = $bindable<string | null>(null),
    onAccept,
    onDecline,
  }: {
    open?: boolean;
    payload?: PlatformInviteJoinPayload | null;
    pending?: boolean;
    error?: string | null;
    recovery?: "open_in_safari" | null;
    copyUrl?: string | null;
    busy?: boolean;
    status?: string | null;
    onAccept?: (opts: { displayName: string }) => void | Promise<void>;
    onDecline?: () => void;
  } = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let displayName = $state("對手");
  let copyStatus = $state<string | null>(null);

  const kind = $derived(payload?.meta.kind ?? "");
  const protocolId = $derived.by(() => {
    const proto = payload ? composeSessionProtocol(payload.meta.intent) : null;
    if (
      proto &&
      typeof proto === "object" &&
      "protocolId" in proto &&
      typeof (proto as { protocolId: unknown }).protocolId === "string"
    ) {
      return (proto as { protocolId: string }).protocolId.trim();
    }
    return "";
  });
  const expiresLabel = $derived.by(() => {
    const at = payload?.meta.expiresAt;
    if (!at) return "";
    try {
      return new Date(at).toLocaleString();
    } catch {
      return "";
    }
  });
  const showSafariRecovery = $derived(
    Boolean(recovery === "open_in_safari" && !payload)
  );
  const canCopy = $derived(Boolean(copyUrl?.trim()));

  $effect(() => {
    if (open && payload?.displayName?.trim()) {
      displayName = payload.displayName.trim();
    }
  });

  $effect(() => {
    if (open && dialogEl && !dialogEl.open) {
      queueMicrotask(() => dialogEl?.showModal());
    }
    if (!open && dialogEl?.open) {
      dialogEl.close();
    }
  });

  $effect(() => {
    if (!open || !showSafariRecovery) copyStatus = null;
  });

  function onDialogClose(): void {
    if (busy) return;
    open = false;
  }

  function decline(): void {
    if (busy) return;
    onDecline?.();
    open = false;
  }

  async function copyInviteLink(): Promise<void> {
    const url = copyUrl?.trim();
    if (!url) return;
    copyStatus = null;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("clipboard unavailable");
      }
      copyStatus = "已複製連結";
    } catch {
      copyStatus = "無法自動複製，請手動選取下方連結";
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  class="playgrounds-dialog border-skin-line bg-skin-fill text-skin-base m-auto w-[min(22rem,calc(100%-1.5rem))] max-h-[min(36rem,calc(100%-1.5rem))] rounded-xl border p-0 shadow-2xl backdrop:bg-black/55"
  aria-labelledby="pg-invite-join-title"
  onclose={onDialogClose}
>
  <div class="playgrounds-dialog-head">
    <div class="playgrounds-dialog-title-row">
      <h2 id="pg-invite-join-title" class="m-0 text-base font-semibold">
        {showSafariRecovery ? "無法開始" : "加入對弈"}
      </h2>
    </div>
    <button
      type="button"
      class="text-skin-base/60 hover:text-skin-base min-h-11 min-w-11 rounded-md px-2 text-sm disabled:opacity-40"
      disabled={busy}
      onclick={decline}
    >
      關閉
    </button>
  </div>

  <div class="flex flex-col gap-3 px-4 py-3">
    {#if pending && !payload && !error && !showSafariRecovery}
      <p class="text-skin-base/55 m-0 text-[12px]" role="status">
        正在讀取邀請…
      </p>
    {:else if showSafariRecovery}
      <p class="text-skin-base m-0 text-sm font-medium" role="alert">
        {error?.trim() || INVITE_STORAGE_RESTRICTED_TITLE}
      </p>
      <p class="text-skin-base/70 m-0 text-sm">
        {INVITE_STORAGE_RESTRICTED_LEAD}
      </p>
      <ol
        class="text-skin-base/55 m-0 list-decimal space-y-1.5 py-0 pl-5 text-[12px] leading-relaxed"
      >
        <li>點分享按鈕（或右上角 ···）</li>
        <li>選擇「用 Safari 開啟」</li>
        <li>或複製連結後，貼到 Safari 網址列</li>
      </ol>
      {#if canCopy}
        <button
          type="button"
          class="bg-skin-accent text-skin-inverted min-h-11 w-full rounded-md px-3 text-sm font-semibold"
          onclick={() => void copyInviteLink()}
        >
          複製邀請連結
        </button>
        {#if copyStatus}
          <p class="text-skin-base/55 m-0 text-[11px]" role="status">{copyStatus}</p>
        {/if}
        {#if copyStatus?.includes("手動")}
          <p
            class="border-skin-line bg-skin-card text-skin-base/70 m-0 break-all rounded-md border px-2.5 py-2 text-[11px]"
          >
            {copyUrl}
          </p>
        {/if}
      {/if}
      <button
        type="button"
        class="border-skin-line bg-skin-card text-skin-base min-h-11 rounded-md border px-3 text-sm"
        onclick={decline}
      >
        關閉
      </button>
    {:else if error && !payload}
      <p class="text-skin-accent m-0 text-sm" role="alert">{error}</p>
      <button
        type="button"
        class="border-skin-line bg-skin-card text-skin-base min-h-11 rounded-md border px-3 text-sm"
        onclick={decline}
      >
        關閉
      </button>
    {:else if payload}
      <p class="text-skin-base/55 m-0 text-[12px] leading-relaxed">
        {#if protocolId}
          主持邀請你以對手身分加入
          <span class="text-skin-base font-medium">{protocolId}</span>。
        {:else}
          主持邀請你加入這場連線（{kind || "invite"}）。
        {/if}
        同意後才會連線入座；拒絕則不會佔用邀請。
      </p>

      {#if expiresLabel}
        <p class="text-skin-base/40 m-0 text-[10px]">約於 {expiresLabel} 前有效</p>
      {/if}

      <label class="flex flex-col gap-1">
        <span class="text-skin-base/50 text-[11px]">顯示名稱（臨時）</span>
        <input
          class="border-skin-line bg-skin-fill text-skin-base min-h-11 w-full rounded-md border px-2.5 text-sm"
          type="text"
          maxlength="32"
          disabled={busy}
          bind:value={displayName}
          autocomplete="nickname"
        />
      </label>

      {#if status}
        <p class="text-skin-base/70 m-0 text-[11px]" role="status">{status}</p>
      {/if}
      {#if error}
        <p class="text-skin-accent m-0 text-[11px]" role="alert">{error}</p>
      {/if}

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="bg-skin-accent text-skin-inverted min-h-11 flex-1 rounded-md px-3 text-sm font-semibold disabled:opacity-40"
          disabled={busy || pending}
          onclick={() =>
            void onAccept?.({ displayName: displayName.trim() || "對手" })}
        >
          {busy ? "連線中…" : "同意入座並連線"}
        </button>
        <button
          type="button"
          class="border-skin-line bg-skin-card text-skin-base min-h-11 rounded-md border px-3 text-sm disabled:opacity-40"
          disabled={busy}
          onclick={decline}
        >
          拒絕
        </button>
      </div>
    {/if}
  </div>
</dialog>
