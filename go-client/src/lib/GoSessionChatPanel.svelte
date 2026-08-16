<script lang="ts">
  import { tick } from "svelte";
  import { goSessionChat } from "$lib/goSessionChat.svelte";
  import {
    SESSION_CHAT_MAX_TEXT_CHARS,
    isSessionChatHostMessage,
  } from "@pg/roster/rosterSessionChat";

  let draft = $state("");
  let listEl = $state<HTMLDivElement | null>(null);
  let quickRepliesOpen = $state(false);

  const connected = $derived(goSessionChat.connected);
  const open = $derived(goSessionChat.panelOpen);
  const messages = $derived(goSessionChat.messages);
  const unread = $derived(goSessionChat.unread);
  const freeText = $derived(goSessionChat.freeTextAllowed);
  const quickReplies = $derived(goSessionChat.quickReplies);

  $effect(() => {
    void messages.length;
    if (!open || !listEl) return;
    void tick().then(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  });

  $effect(() => {
    if (!open) quickRepliesOpen = false;
  });

  function toggle() {
    goSessionChat.togglePanel();
  }

  function close() {
    goSessionChat.setPanelOpen(false);
  }

  function onSubmit(ev: Event) {
    ev.preventDefault();
    if (!freeText) return;
    if (goSessionChat.sendText(draft)) {
      draft = "";
    }
  }

  function onQuick(q: string) {
    if (goSessionChat.sendQuickReply(q)) {
      quickRepliesOpen = false;
    }
  }

  function isHost(m: (typeof messages)[number]): boolean {
    if (m.local && goSessionChat.localRole === "host") return true;
    return isSessionChatHostMessage(m);
  }

  function who(m: (typeof messages)[number]): string {
    if (m.local) return "我";
    if (isHost(m)) return "";
    return (m.name && m.name.trim()) || "對手";
  }
</script>

{#if connected}
  <div class="session-chat" class:session-chat--open={open}>
    {#if open}
      <button
        type="button"
        class="session-chat-scrim"
        aria-label="關閉對話"
        onclick={close}
      ></button>
    {/if}

    <div class="session-chat-rail" aria-hidden={open ? undefined : "true"}>
      <button
        type="button"
        class="session-chat-handle"
        aria-expanded={open}
        aria-controls="go-session-chat-panel"
        aria-label={unread > 0 ? `對話，${unread} 則未讀` : "對話"}
        onclick={toggle}
      >
        <span class="session-chat-handle-glyph" aria-hidden="true">話</span>
        {#if unread > 0 && !open}
          <span class="session-chat-badge" aria-hidden="true"
            >{unread > 9 ? "9+" : unread}</span
          >
        {/if}
      </button>

      {#if open}
        <div
          id="go-session-chat-panel"
          class="session-chat-panel"
          role="dialog"
          aria-label="同場對話"
        >
          <p class="session-chat-kicker">同場對話</p>
          <div class="session-chat-list" bind:this={listEl} role="log">
            {#if messages.length === 0}
              <p class="session-chat-empty">還沒有訊息。跟對手打聲招呼吧。</p>
            {:else}
              {#each messages as m (m.id)}
                <div
                  class={[
                    "session-chat-row",
                    m.local && "session-chat-row--local",
                    isHost(m) && "session-chat-row--host",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span class="session-chat-who">
                    {#if isHost(m)}
                      <span class="session-chat-host-tag">主持</span>
                    {/if}
                    {#if who(m)}
                      <span>{who(m)}</span>
                    {/if}
                  </span>
                  <span class="session-chat-text">{m.text}</span>
                </div>
              {/each}
            {/if}
          </div>
          {#if quickReplies.length > 0}
            <button
              type="button"
              class="session-chat-quick-toggle"
              aria-expanded={quickRepliesOpen}
              aria-controls="go-session-chat-quick-replies"
              onclick={() => (quickRepliesOpen = !quickRepliesOpen)}
            >
              <span aria-hidden="true">{quickRepliesOpen ? "▾" : "▸"}</span>
              快捷訊息
            </button>
            {#if quickRepliesOpen}
              <div
                id="go-session-chat-quick-replies"
                class="session-chat-quick"
                role="group"
                aria-label="快捷訊息"
              >
                {#each quickReplies as q (q)}
                  <button
                    type="button"
                    class="session-chat-quick-btn"
                    onclick={() => onQuick(q)}
                  >
                    {q}
                  </button>
                {/each}
              </div>
            {/if}
          {/if}
          {#if freeText}
            <form class="session-chat-form" onsubmit={onSubmit}>
              <input
                class="session-chat-input"
                type="text"
                maxlength={SESSION_CHAT_MAX_TEXT_CHARS}
                placeholder="說點什麼…"
                autocomplete="off"
                enterkeyhint="send"
                bind:value={draft}
              />
              <button
                type="submit"
                class="session-chat-send pixel-btn"
                disabled={!draft.trim()}
              >
                送出
              </button>
            </form>
          {:else}
            <p class="session-chat-locked">對弈中暫不開放打字</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .session-chat {
    position: absolute;
    inset: 0;
    z-index: 24;
    pointer-events: none;
  }
  .session-chat-scrim {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 0;
    border: none;
    background: color-mix(in oklab, rgb(var(--ink)) 35%, transparent);
    pointer-events: auto;
    cursor: pointer;
  }
  .session-chat-rail {
    position: absolute;
    top: 0;
    right: 0;
    width: 0;
    height: 100%;
    pointer-events: none;
  }
  .session-chat-handle {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    /* Match GoGameDrawer handle width／height. */
    width: 0.75rem;
    height: 3.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--pixel-edge);
    background: rgb(var(--card));
    color: rgb(var(--ink));
    font-family: var(--pixel);
    font-size: 0.45rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: var(--pixel-shadow);
    pointer-events: auto;
    padding: 0;
    -webkit-tap-highlight-color: color-mix(
      in oklab,
      rgb(var(--accent)) 24%,
      transparent
    );
  }
  .session-chat-handle:hover,
  .session-chat-handle:focus-visible {
    border-color: rgb(var(--accent));
    color: rgb(var(--accent));
    outline: none;
  }
  .session-chat-handle-glyph {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 0.55rem;
  }
  .session-chat-badge {
    position: absolute;
    top: -0.35rem;
    left: -0.55rem;
    min-width: 1rem;
    height: 1rem;
    padding: 0 0.15rem;
    border-radius: 999px;
    background: rgb(var(--accent));
    color: rgb(var(--fill));
    font-size: 0.55rem;
    font-weight: 700;
    line-height: 1rem;
    text-align: center;
  }
  .session-chat-panel {
    position: absolute;
    top: calc(50% - 1.625rem);
    right: calc(0.75rem + var(--pixel-edge));
    width: 16rem;
    max-width: 78vw;
    max-height: min(70vh, 22rem);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background:
      linear-gradient(
        180deg,
        color-mix(in oklab, rgb(var(--gold-soft)) 14%, transparent) 0,
        transparent 40%
      ),
      rgb(var(--fill));
    box-shadow: var(--pixel-shadow);
    pointer-events: auto;
  }
  .session-chat--open .session-chat-handle {
    border-left: none;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    background: rgb(var(--fill));
    border-color: rgb(var(--ink));
  }
  .session-chat--open .session-chat-handle:hover,
  .session-chat--open .session-chat-handle:focus-visible {
    border-color: rgb(var(--ink));
    color: rgb(var(--ink));
    outline: none;
  }
  .session-chat--open .session-chat-panel {
    border-right: none;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .session-chat-kicker {
    margin: 0;
    font-family: var(--pixel);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgb(var(--gold));
  }
  .session-chat-kicker::before {
    content: "▸ ";
  }
  .session-chat-list {
    flex: 1 1 auto;
    min-height: 6rem;
    max-height: 12rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-family: var(--pixel);
    font-size: 0.75rem;
  }
  .session-chat-empty {
    margin: 0;
    opacity: 0.7;
    line-height: 1.4;
  }
  .session-chat-row {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    align-items: flex-start;
  }
  .session-chat-row--local {
    align-items: flex-end;
  }
  .session-chat-who {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.65rem;
    opacity: 0.65;
  }
  .session-chat-host-tag {
    flex: 0 0 auto;
    padding: 0.05rem 0.28rem;
    border: 2px solid rgb(var(--ink));
    border-radius: 0.15rem;
    background: rgb(var(--gold));
    color: rgb(var(--ink));
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1.2;
    opacity: 1;
    box-shadow: 1px 1px 0 rgb(var(--ink));
  }
  .session-chat-row--host .session-chat-who {
    opacity: 1;
    color: rgb(var(--ink));
    font-weight: 700;
  }
  .session-chat-text {
    position: relative;
    max-width: 100%;
    margin-left: 0.45rem;
    padding: 0.45rem 0.55rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: 0.15rem 0.55rem 0.55rem 0.55rem;
    background: rgb(var(--card));
    box-shadow: 2px 2px 0 color-mix(in oklab, rgb(var(--ink)) 80%, transparent);
    word-break: break-word;
    line-height: 1.35;
  }
  /* Pixel/RPG speech tail: outlined diamond joined to the bubble. */
  .session-chat-text::before,
  .session-chat-text::after {
    content: "";
    position: absolute;
    width: 0.58rem;
    height: 0.58rem;
    transform: rotate(45deg);
  }
  .session-chat-text::before {
    left: -0.38rem;
    top: 0.42rem;
    border-left: var(--pixel-edge) solid rgb(var(--ink));
    border-bottom: var(--pixel-edge) solid rgb(var(--ink));
    background: rgb(var(--card));
  }
  .session-chat-text::after {
    left: -0.05rem;
    top: 0.42rem;
    background: rgb(var(--card));
  }
  .session-chat-row--local .session-chat-text {
    margin-right: 0.45rem;
    margin-left: 0;
    border-radius: 0.55rem 0.15rem 0.55rem 0.55rem;
    background: color-mix(in oklab, rgb(var(--accent)) 18%, rgb(var(--card)));
  }
  .session-chat-row--local .session-chat-text::before {
    right: -0.38rem;
    left: auto;
    border: none;
    border-top: var(--pixel-edge) solid rgb(var(--ink));
    border-right: var(--pixel-edge) solid rgb(var(--ink));
    background: color-mix(in oklab, rgb(var(--accent)) 18%, rgb(var(--card)));
  }
  .session-chat-row--local .session-chat-text::after {
    right: -0.05rem;
    left: auto;
    background: color-mix(in oklab, rgb(var(--accent)) 18%, rgb(var(--card)));
  }
  .session-chat-form {
    display: flex;
    gap: 0.35rem;
    align-items: stretch;
  }
  .session-chat-quick {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .session-chat-quick-toggle {
    min-height: 2.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--pixel-edge);
    background: color-mix(in oklab, rgb(var(--gold-soft)) 18%, rgb(var(--fill)));
    color: rgb(var(--ink));
    font-family: var(--pixel);
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
  }
  .session-chat-quick-toggle:hover,
  .session-chat-quick-toggle:focus-visible {
    border-color: rgb(var(--accent));
    color: rgb(var(--accent));
    outline: none;
  }
  .session-chat-quick-btn {
    min-height: 2.5rem;
    padding: 0.25rem 0.5rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--pixel-edge);
    background: rgb(var(--card));
    color: rgb(var(--ink));
    font-family: var(--pixel);
    font-size: 0.7rem;
    cursor: pointer;
    -webkit-tap-highlight-color: color-mix(
      in oklab,
      rgb(var(--accent)) 24%,
      transparent
    );
  }
  .session-chat-quick-btn:hover,
  .session-chat-quick-btn:focus-visible {
    border-color: rgb(var(--accent));
    color: rgb(var(--accent));
    outline: none;
  }
  .session-chat-quick-btn:active {
    transform: translate(1px, 1px);
  }
  .session-chat-input {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 2.75rem;
    padding: 0.4rem 0.5rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--pixel-edge);
    background: rgb(var(--card));
    color: rgb(var(--ink));
    font-family: var(--pixel);
    font-size: 0.85rem;
  }
  .session-chat-send {
    flex: 0 0 auto;
    min-height: 2.75rem;
    padding-inline: 0.65rem;
  }
  .session-chat-locked {
    margin: 0;
    font-family: var(--pixel);
    font-size: 0.7rem;
    opacity: 0.7;
  }
  @media (max-width: 30rem) {
    .session-chat-handle {
      width: 0.67rem;
    }
    .session-chat-panel {
      right: calc(0.67rem + var(--pixel-edge));
      width: 14rem;
    }
  }
</style>
