<script lang="ts">
  /** Compact stroke icons for Playgrounds chrome (Lucide-like paths). */
  export type PgIconName =
    | "refresh"
    | "maximize"
    | "minimize"
    | "panelClose"
    | "panelRight"
    | "panelBottom"
    | "trash"
    | "upload"
    | "folderUp"
    | "download"
    | "filePlus"
    | "folderPlus"
    | "folder"
    | "files"
    | "pencil"
    | "link"
    | "x"
    | "unlink"
    | "key"
    | "copy"
    | "bot"
    | "sparkles"
    | "check"
    | "search"
    | "chevronDown"
    | "chevronUp"
    | "listCollapse"
    | "moreHorizontal"
    | "alertTriangle"
    | "github"
    | "layers"
    | "settings"
    | "pause"
    | "play";

  let {
    name,
    size = 14,
    class: className = "",
  }: {
    name: PgIconName;
    size?: number;
    class?: string;
  } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  style="fill: none"
  aria-hidden="true"
>
  {#if name === "refresh"}
    <path d="M21 12a9 9 0 1 1-2.6-6.3"></path>
    <polyline points="21 3 21 9 15 9"></polyline>
  {:else if name === "maximize"}
    <polyline points="15 3 21 3 21 9"></polyline>
    <polyline points="9 21 3 21 3 15"></polyline>
    <line x1="21" y1="3" x2="14" y2="10"></line>
    <line x1="3" y1="21" x2="10" y2="14"></line>
  {:else if name === "minimize"}
    <polyline points="4 14 10 14 10 20"></polyline>
    <polyline points="20 10 14 10 14 4"></polyline>
    <line x1="14" y1="10" x2="21" y2="3"></line>
    <line x1="3" y1="21" x2="10" y2="14"></line>
  {:else if name === "panelClose"}
    <rect x="3" y="3" width="18" height="18" rx="2"></rect>
    <line x1="9" y1="3" x2="9" y2="21"></line>
    <line x1="14" y1="9" x2="18" y2="9"></line>
  {:else if name === "panelRight"}
    <rect x="3" y="3" width="18" height="18" rx="2"></rect>
    <line x1="15" y1="3" x2="15" y2="21"></line>
  {:else if name === "panelBottom"}
    <rect x="3" y="3" width="18" height="18" rx="2"></rect>
    <line x1="3" y1="15" x2="21" y2="15"></line>
  {:else if name === "trash"}
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
    <path d="M10 11v6"></path>
    <path d="M14 11v6"></path>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
  {:else if name === "upload"}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="17 8 12 3 7 8"></polyline>
    <line x1="12" y1="3" x2="12" y2="15"></line>
  {:else if name === "folderUp"}
    <path
      d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
    ></path>
    <path d="M12 10v6"></path>
    <polyline points="9 13 12 10 15 13"></polyline>
  {:else if name === "download"}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  {:else if name === "filePlus"}
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="12" y1="18" x2="12" y2="12"></line>
    <line x1="9" y1="15" x2="15" y2="15"></line>
  {:else if name === "folderPlus"}
    <path
      d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
    ></path>
    <line x1="12" y1="11" x2="12" y2="17"></line>
    <line x1="9" y1="14" x2="15" y2="14"></line>
  {:else if name === "folder"}
    <path
      d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
    ></path>
  {:else if name === "files"}
    <path d="M15.5 2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5L15.5 2z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <path d="M4 6v14a2 2 0 0 0 2 2h10"></path>
  {:else if name === "pencil"}
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
  {:else if name === "link"}
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"></path>
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"></path>
  {:else if name === "x"}
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  {:else if name === "unlink"}
    <path d="M18.8 11.2a5 5 0 0 0-1.3-5.5l-3-3a5 5 0 0 0-7.1 7.1l1.2 1.2"></path>
    <path d="M5.2 12.8a5 5 0 0 0 1.3 5.5l3 3a5 5 0 0 0 7.1-7.1l-1.2-1.2"></path>
    <line x1="2" y1="2" x2="22" y2="22"></line>
  {:else if name === "key"}
    <path d="M21 2l-2 2m-7.6 7.6a5 5 0 1 1-2.1-2.1L15 4h3v3l1.4 1.4"></path>
    <circle cx="7.5" cy="15.5" r="3.5"></circle>
  {:else if name === "copy"}
    <rect x="9" y="9" width="13" height="13" rx="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  {:else if name === "bot"}
    <path d="M12 8V4H8"></path>
    <rect x="4" y="8" width="16" height="12" rx="2"></rect>
    <path d="M2 14h2"></path>
    <path d="M20 14h2"></path>
    <path d="M9 13v2"></path>
    <path d="M15 13v2"></path>
  {:else if name === "sparkles"}
    <path
      d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"
    ></path>
    <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z"></path>
  {:else if name === "check"}
    <polyline points="20 6 9 17 4 12"></polyline>
  {:else if name === "search"}
    <circle cx="11" cy="11" r="7"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  {:else if name === "chevronDown"}
    <polyline points="6 9 12 15 18 9"></polyline>
  {:else if name === "chevronUp"}
    <polyline points="18 15 12 9 6 15"></polyline>
  {:else if name === "listCollapse"}
    <path d="M10 5h11"></path>
    <path d="M10 12h11"></path>
    <path d="M10 19h11"></path>
    <path d="m3 10 3-3-3-3"></path>
    <path d="m3 20 3-3-3-3"></path>
  {:else if name === "moreHorizontal"}
    <path d="M5 12h.01"></path>
    <path d="M12 12h.01"></path>
    <path d="M19 12h.01"></path>
  {:else if name === "alertTriangle"}
    <path d="M10.3 3.9 1.7 18a2 2 0 0 0 1.7 3h17.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <path d="M12 17h.01"></path>
  {:else if name === "github"}
    <path
      d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4"
    ></path>
    <path d="M9 18c-4.5 1.5-4.5-2.5-7-3"></path>
  {:else if name === "layers"}
    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
    <polyline points="2 17 12 22 22 17"></polyline>
    <polyline points="2 12 12 17 22 12"></polyline>
  {:else if name === "settings"}
    <circle cx="12" cy="12" r="3"></circle>
    <path
      d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
    ></path>
  {:else if name === "pause"}
    <rect x="6" y="4" width="4" height="16"></rect>
    <rect x="14" y="4" width="4" height="16"></rect>
  {:else if name === "play"}
    <polygon points="6 3 20 12 6 21 6 3"></polygon>
  {/if}
</svg>
