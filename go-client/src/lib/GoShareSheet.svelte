<script lang="ts">
  import ShareSheet from "@components/ShareSheet.svelte";

  type Props = {
    open: boolean;
    title: string;
    url: string;
    spoken?: string;
    hint?: string;
    /** Mirrored chrome flash — visible above the panel while modal is open. */
    flash?: string;
    onClose: () => void;
    onFlash: (msg: string) => void;
  };

  let {
    open,
    title,
    url,
    spoken = "",
    hint,
    flash = "",
    onClose,
    onFlash,
  }: Props = $props();
</script>

<ShareSheet
  {open}
  {title}
  {url}
  {spoken}
  hint={hint}
  {flash}
  urlAsLink={false}
  {onClose}
  {onFlash}
/>
