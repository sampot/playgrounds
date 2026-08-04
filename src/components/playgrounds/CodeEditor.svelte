<script lang="ts">
  import { javascript } from "@codemirror/lang-javascript";
  import { html } from "@codemirror/lang-html";
  import { css } from "@codemirror/lang-css";
  import { json } from "@codemirror/lang-json";
  import { EditorState, Compartment, type Extension } from "@codemirror/state";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { EditorView } from "@codemirror/view";
  import { basicSetup } from "codemirror";
  import { onDestroy, onMount } from "svelte";

  interface Props {
    doc: string;
    language?: string;
    onDocChange?: (doc: string) => void;
  }

  let { doc, language = "plaintext", onDocChange }: Props = $props();

  let host = $state<HTMLDivElement | null>(null);
  let view: EditorView | null = null;
  const langComp = new Compartment();
  const themeComp = new Compartment();
  let applyingExternal = false;

  function langExtension(lang: string): Extension {
    switch (lang) {
      case "html":
        return html();
      case "css":
        return css();
      case "json":
        return json();
      case "typescript":
        return javascript({ typescript: true });
      case "javascript":
        return javascript();
      default:
        return [];
    }
  }

  function isDark(): boolean {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  function themeExt(): Extension {
    return isDark() ? oneDark : [];
  }

  function syncTheme() {
    view?.dispatch({
      effects: themeComp.reconfigure(themeExt()),
    });
  }

  onMount(() => {
    if (!host) return;

    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc,
        extensions: [
          basicSetup,
          langComp.of(langExtension(language)),
          themeComp.of(themeExt()),
          EditorView.theme({
            "&": { height: "100%", fontSize: "13px" },
            ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono, ui-monospace, monospace)" },
            "&.cm-editor": { height: "100%" },
            ".cm-content": { paddingBlock: "0.5rem" },
          }),
          EditorView.updateListener.of(update => {
            if (!update.docChanged || applyingExternal) return;
            onDocChange?.(update.state.doc.toString());
          }),
        ],
      }),
    });

    document.addEventListener("theme-change", syncTheme);
    const obs = new MutationObserver(syncTheme);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });

    return () => {
      document.removeEventListener("theme-change", syncTheme);
      obs.disconnect();
    };
  });

  $effect(() => {
    if (!view) return;
    const next = langExtension(language);
    view.dispatch({ effects: langComp.reconfigure(next) });
  });

  $effect(() => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (doc === current) return;
    applyingExternal = true;
    try {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: doc },
      });
    } finally {
      // Keep flag through sync listeners; clear after microtask in case a
      // follow-up plugin transaction runs in the same turn.
      queueMicrotask(() => {
        applyingExternal = false;
      });
    }
  });

  onDestroy(() => {
    view?.destroy();
    view = null;
  });
</script>

<div class="code-editor h-full min-h-0 w-full overflow-hidden" bind:this={host}></div>
