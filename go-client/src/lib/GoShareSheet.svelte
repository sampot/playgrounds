<script lang="ts">
  import ShareSheet from "@components/ShareSheet.svelte";

  type Props = {
    open: boolean;
    title: string;
    url: string;
    spoken?: string;
    hint?: string;
    onClose: () => void;
    onFlash: (msg: string) => void;
  };

  let { open, title, url, spoken = "", hint, onClose, onFlash }: Props = $props();
</script>

<ShareSheet
  {open}
  {title}
  {url}
  {spoken}
  hint={hint}
  urlAsLink={false}
  {onClose}
  {onFlash}
/>
