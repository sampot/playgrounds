<script lang="ts">
  /** Per-SAM catalog glyph (24×24 stroke icons). Fallback: generic mark. */
  let {
    repo,
    title,
    class: className = '',
  }: { repo: string; title: string; class?: string } = $props();

const glyphs: Record<string, string> = {
  "pg-hashlab":
    '<path d="M5 8h14M5 16h14M9 4v16M15 4v16"/><circle cx="9" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="16" r="1.2" fill="currentColor" stroke="none"/>',
  "pg-jwtpeek":
    '<path d="M8 11a4 4 0 1 1 3.2 3.9L14 18l2-1 1 2 2-1-3.4-5.1A4 4 0 0 1 8 11z"/><circle cx="7.2" cy="10.2" r="1" fill="currentColor" stroke="none"/>',
  "pg-regexlab":
    '<path d="M5 7h6l-5 10h6"/><path d="M14 7h5M16.5 7v10M14 17h5"/>',
  "pg-cronread":
    '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/><path d="M12 4v1.5M4 12H5.5M12 19.5V21M19.5 12H21"/>',
  "pg-jsonfmt":
    '<path d="M8 5c-2 0-3 1.2-3 3v2c0 1-.7 1.5-1.5 1.5S2 12 2 12s1.5.3 1.5 1.5V16c0 1.8 1 3 3 3"/><path d="M16 5c2 0 3 1.2 3 3v2c0 1 .7 1.5 1.5 1.5S22 12 22 12s-1.5.3-1.5 1.5V16c0 1.8-1 3-3 3"/>',
  "pg-idmint":
    '<rect x="4" y="6" width="16" height="12" rx="2"/><circle cx="9" cy="12" r="2"/><path d="M13 10h4M13 14h3"/>',
  "pg-textdiff":
    '<path d="M4 6h6M4 10h5M4 14h6M4 18h4"/><path d="M14 6h6M14 10h5M14 14h6M14 18h4"/><path d="M12 5v14"/>',
  "pg-basecodec":
    '<rect x="3" y="5" width="7" height="14" rx="1.5"/><rect x="14" y="5" width="7" height="14" rx="1.5"/><path d="M8 9v6M17 9v2M17 13v2" stroke-linecap="round"/>',
  "pg-pyrun":
    '<path d="M12 3c-3 0-4.5 1.5-4.5 3.5V10h4v1H6.5C4 11 3 13 3 15.5S4.5 21 8 21c1.2 0 2-.3 2-.3"/><path d="M12 21c3 0 4.5-1.5 4.5-3.5V14h-4v-1h5c2.5 0 3.5-2 3.5-4.5S19.5 3 16 3c-1.2 0-2 .3-2 .3"/><circle cx="9.5" cy="6.5" r="0.8" fill="currentColor" stroke="none"/><circle cx="14.5" cy="17.5" r="0.8" fill="currentColor" stroke="none"/>',
  "pg-tzlook":
    '<circle cx="12" cy="12" r="8"/><path d="M12 4a10 10 0 0 1 0 16M12 4a10 10 0 0 0 0 16M4 12h16M8 7.5c1.5 1 3 1.5 4 1.5s2.5-.5 4-1.5M8 16.5c1.5-1 3-1.5 4-1.5s2.5.5 4 1.5"/>',
  "pg-colorcast":
    '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h8"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="9" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/>',
  "pg-skyburst":
    '<path d="M12 19V9"/><path d="M9 12l3-5 3 5"/><path d="M6 19h12"/><path d="M8 7l-1.5-2M16 7l1.5-2M12 5V3"/>',
  "pg-breakout":
    '<rect x="4" y="4" width="4" height="3" rx="0.5"/><rect x="10" y="4" width="4" height="3" rx="0.5"/><rect x="16" y="4" width="4" height="3" rx="0.5"/><rect x="7" y="8" width="4" height="3" rx="0.5"/><rect x="13" y="8" width="4" height="3" rx="0.5"/><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none"/><path d="M8 20h8"/>',
  "pg-starshot":
    '<path d="M12 4l1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5L12 4z"/><path d="M12 16v5M9 19h6"/>',
  "pg-mazeglow":
    '<path d="M4 4h7v4H8v8h4V12h4v8h4V8h-4V4h4"/><circle cx="6" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
  "pg-leaptrail":
    '<path d="M5 18h4v-3H5zM11 18h4v-6h-4zM17 18h3V9h-3z"/><path d="M7 10c1-3 3-4 5-2"/><circle cx="13" cy="7" r="1.5"/>',
  "pg-moletap":
    '<ellipse cx="12" cy="17" rx="7" ry="2.5"/><path d="M7 16c0-4 2.2-7 5-7s5 3 5 7"/><circle cx="10.5" cy="12" r="0.7" fill="currentColor" stroke="none"/><circle cx="13.5" cy="12" r="0.7" fill="currentColor" stroke="none"/>',
  "pg-banqi":
    '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="4.5"/><path d="M12 9.5v5M10 12h4"/>',
  "pg-jungle":
    '<path d="M12 20c-4 0-7-2.5-7-6 0-2 1-3.5 2.5-4.5C8 7 9.5 5 12 4c2.5 1 4 3 4.5 5.5C18 10.5 19 12 19 14c0 3.5-3 6-7 6z"/><path d="M9 14h.01M15 14h.01M12 16.5c1 0 1.5-.5 1.5-.5"/>',
  "pg-wingrace":
    '<path d="M4 14h16l-2 3H6l-2-3z"/><path d="M12 7l6 5H6l6-5z"/><path d="M9 7c0-2 1.2-3.5 3-3.5S15 5 15 7"/>',
  "pg-pinfall":
    '<path d="M12 3v4"/><circle cx="12" cy="9" r="2"/><path d="M8 14l-2 6h3l1-3 1 3h3l-2-6"/><circle cx="7" cy="12" r="1"/><circle cx="17" cy="13" r="1"/><circle cx="14" cy="11" r="0.8"/>',
  "pg-mali":
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="5" r="1.3" fill="currentColor" stroke="none"/><circle cx="17.5" cy="8" r="1.1"/><circle cx="18" cy="14" r="1.1"/><circle cx="14" cy="18.5" r="1.1"/><circle cx="8" cy="17.5" r="1.1"/><circle cx="5.5" cy="12" r="1.1"/><circle cx="7" cy="7" r="1.1"/>',
  "pg-gomoku":
    '<path d="M5 5h14v14H5z"/><path d="M5 9h14M5 13h14M5 17h14M9 5v14M13 5v14M17 5v14"/><circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="13" cy="13" r="1.3" fill="currentColor" stroke="none"/>',
  "pg-tictactoe":
    '<path d="M4 4h16v16H4z"/><path d="M4 12h16M12 4v16"/><path d="M6.5 6.5l3 3M9.5 6.5l-3 3"/><circle cx="16" cy="16" r="2"/>',
  "pg-inkbloom":
    '<path d="M12 4c2 4 6 6 6 10a6 6 0 1 1-12 0c0-4 4-6 6-10z"/><path d="M10 16c.5 1 1.5 1.5 2 1.5"/>',
  "pg-bounceland":
    '<circle cx="12" cy="9" r="4"/><path d="M6 19c2-3 4-4 6-4s4 1 6 4"/><path d="M9 12c1 2 2 3 3 3"/>',
  "pg-cellife":
    '<rect x="4" y="4" width="4" height="4" rx="0.5"/><rect x="10" y="4" width="4" height="4" rx="0.5" fill="currentColor" stroke="none"/><rect x="16" y="4" width="4" height="4" rx="0.5"/><rect x="4" y="10" width="4" height="4" rx="0.5" fill="currentColor" stroke="none"/><rect x="10" y="10" width="4" height="4" rx="0.5"/><rect x="16" y="10" width="4" height="4" rx="0.5" fill="currentColor" stroke="none"/><rect x="4" y="16" width="4" height="4" rx="0.5"/><rect x="10" y="16" width="4" height="4" rx="0.5" fill="currentColor" stroke="none"/><rect x="16" y="16" width="4" height="4" rx="0.5"/>',
  "pg-diginet":
    '<circle cx="5" cy="8" r="1.5"/><circle cx="5" cy="16" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/><circle cx="19" cy="9" r="1.5"/><circle cx="19" cy="15" r="1.5"/><path d="M6.5 8.2 10.5 6.5M6.5 9 10.5 11.5M6.5 15.5 10.5 12.5M6.5 16.2 10.5 17.5M13.5 6.5 17.5 8.5M13.5 12 17.5 9.5M13.5 12.5 17.5 14.5M13.5 17.5 17.5 15.5"/>',
  "pg-logigate":
    '<path d="M4 8h4"/><path d="M4 16h4"/><path d="M8 6v12c5 0 7-3 8-6-1-3-3-6-8-6z"/><path d="M16 12h4"/><circle cx="21" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  "pg-sketchpad":
    '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16l3-8 2 5 1.5-3L18 16"/><path d="M15 7l2 2"/>',
  "pg-wavepad":
    '<path d="M3 12c2-6 3-6 5 0s3 6 5 0 3-6 5 0 3 6 3 0"/>',
  "pg-voicelab":
    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v4M9 21h6"/>',
  "pg-workflow":
    '<rect x="4" y="4" width="7" height="5" rx="1"/><rect x="13" y="9.5" width="7" height="5" rx="1"/><rect x="4" y="15" width="7" height="5" rx="1"/><path d="M11 6.5h1.5a2 2 0 0 1 2 2V9.5M7.5 9v6"/>',
};

const fallback =
  '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 12h6M12 9v6"/>';

  let inner = $derived(glyphs[repo] ?? fallback);
</script>

<span class={["sam-icon", className].filter(Boolean).join(' ')} aria-hidden="true" {title}>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    {@html inner}
  </svg>
</span>

<style>
  .sam-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 0.65rem;
    color: rgb(var(--color-accent));
    background: color-mix(in oklab, rgb(var(--color-accent)) 14%, transparent);
    border: 1px solid color-mix(in oklab, rgb(var(--color-accent)) 28%, rgb(var(--color-border)));
    flex-shrink: 0;
  }

  .sam-icon svg {
    width: 1.85rem;
    height: 1.85rem;
    display: block;
  }
</style>
