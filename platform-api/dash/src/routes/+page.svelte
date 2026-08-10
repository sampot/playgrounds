<script lang="ts">
  import { dash } from "$lib/dash.svelte";
  import DashField from "$lib/components/DashField.svelte";
</script>

{#if !dash.me}
  <section>
    <div class="panel">
      <h2>進入</h2>
      {#if dash.returnFieldHint}
        <p class="lede">
          登入成功後會回到你的遊樂場
          <span class="mono">{dash.returnFieldHint}</span>
          。
        </p>
      {:else}
        <p class="lede">
          所有帳號由此進入。登入後會依權限顯示可用功能。
        </p>
      {/if}
      <div class="row">
        <a class="btn" href="/auth/github?intent=login">使用 GitHub 進入</a>
        <a class="btn secondary" href="/auth/google?intent=login"
          >使用 Google 進入</a
        >
      </div>
    </div>
  </section>
{:else}
  <DashField />
{/if}
