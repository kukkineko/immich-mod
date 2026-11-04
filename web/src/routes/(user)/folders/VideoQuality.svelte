<script lang="ts">
  import { AUTO, STORED } from './video-stream';
  import { videoUi } from './video-ui.svelte';

  let open = $state(false);

  const options = $derived([
    ...(videoUi.encoded ? [{ key: STORED, label: 'Stored copy' }] : []),
    { key: AUTO, label: 'Live · Auto' },
    ...videoUi.qualities.map((quality) => ({ key: quality.key, label: `Live · ${quality.label}` })),
  ]);

  // the choice that is playing; a saved "stored" without a stored copy plays as live auto
  const current = $derived(videoUi.quality === STORED && !videoUi.encoded ? AUTO : videoUi.quality);

  const pick = (key: string) => {
    videoUi.choose?.(key);
    open = false;
  };
</script>

<svelte:window onkeydown={(event) => open && event.key === 'Escape' && ((open = false), event.stopPropagation())} />

{#if videoUi.active}
  <div class="relative">
    <button
      type="button"
      class="rounded-full bg-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/30 sm:px-4 sm:py-2 sm:text-base"
      aria-haspopup="menu"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      Quality
    </button>

    {#if open}
      <!-- a sheet from the bottom on a phone, a dropdown from the button on a larger screen -->
      <div
        class="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-neutral-900 p-3 text-white shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:bottom-auto sm:mt-2 sm:w-72 sm:rounded-xl"
        role="menu"
      >
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-sm font-semibold">Video quality</h2>
          <button
            type="button"
            class="rounded-full bg-white/15 px-3 py-1 text-lg leading-none hover:bg-white/25"
            aria-label="Close"
            onclick={() => (open = false)}
          >
            &#10005;
          </button>
        </div>
        {#each options as option (option.key)}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={current === option.key}
            class="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white/10 {current ===
            option.key
              ? 'bg-white/10 font-semibold'
              : ''}"
            onclick={() => pick(option.key)}
          >
            {option.label}
            {#if current === option.key}<span aria-hidden="true">&check;</span>{/if}
          </button>
        {/each}
        {#if videoUi.qualities.length === 0 && !(videoUi.encoded && current === STORED)}
          <p class="px-3 py-2 text-xs text-neutral-400">Loading sizes…</p>
        {/if}
      </div>
    {/if}
  </div>
{/if}
