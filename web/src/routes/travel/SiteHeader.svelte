<script lang="ts">
  import { appSettings } from '$lib/stores/app-settings.svelte';

  interface Props {
    back?: boolean;
  }

  let { back = false }: Props = $props();
</script>

<header class="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-5 text-white sm:px-10">
  <div class="flex items-center gap-4">
    {#if back}
      <a href="/travel" class="text-sm tracking-widest uppercase opacity-80 transition hover:opacity-100">&larr; All trips</a>
    {:else}
      <a href="/travel" class="font-serif text-2xl tracking-wide">{appSettings.title}</a>
    {/if}
  </div>
  <a
    href="/auth/login?continue=%2Ffolders"
    class="rounded-full border border-white/30 px-4 py-1.5 text-xs tracking-widest uppercase backdrop-blur transition hover:bg-white/15"
  >
    Private
  </a>
</header>
