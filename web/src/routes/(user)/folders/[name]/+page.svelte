<script lang="ts">
  import FolderHeader from '../FolderHeader.svelte';
  import { PAGE_SIZE, type FolderAsset } from '../folder-types';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let extra = $state<FolderAsset[]>([]);
  let page = $state(0);
  let done = $state<boolean | undefined>();
  let loading = $state(false);
  let openIndex = $state<number | undefined>();

  const assets = $derived([...data.assets, ...extra]);
  const finished = $derived(done ?? data.assets.length < PAGE_SIZE);
  const current = $derived(openIndex === undefined ? undefined : assets[openIndex]);

  const loadMore = async () => {
    loading = true;
    try {
      const next = page + 1;
      const response = await fetch(
        `/api/view/folder-people/assets?name=${encodeURIComponent(data.name)}&page=${next}&size=${PAGE_SIZE}`,
      );
      const more: FolderAsset[] = response.ok ? await response.json() : [];
      extra = [...extra, ...more];
      page = next;
      done = more.length < PAGE_SIZE;
    } finally {
      loading = false;
    }
  };

  const step = (delta: number) => {
    if (openIndex === undefined) {
      return;
    }
    const next = openIndex + delta;
    if (next >= 0 && next < assets.length) {
      openIndex = next;
    }
  };

  const onkeydown = (event: KeyboardEvent) => {
    if (openIndex === undefined) {
      return;
    }
    if (event.key === 'Escape') {
      openIndex = undefined;
    } else if (event.key === 'ArrowLeft') {
      step(-1);
    } else if (event.key === 'ArrowRight') {
      step(1);
    }
  };
</script>

<svelte:window {onkeydown} />

<svelte:head>
  <title>{data.meta.title}</title>
</svelte:head>

<div class="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
  <FolderHeader title={data.name} backHref="/folders" />

  <main class="p-1">
    {#if data.failed}
      <p class="py-16 text-center text-neutral-500">Could not load this folder.</p>
    {:else if assets.length === 0}
      <p class="py-16 text-center text-neutral-500">Nothing in this folder.</p>
    {:else}
      <ul class="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {#each assets as asset, index (asset.id)}
          <li class="relative aspect-square overflow-hidden bg-neutral-200 dark:bg-neutral-800">
            <button type="button" class="block h-full w-full" onclick={() => (openIndex = index)}>
              <img
                src="/api/assets/{asset.id}/thumbnail?size=thumbnail"
                alt={asset.originalFileName}
                loading="lazy"
                draggable="false"
                class="h-full w-full object-cover"
              />
              {#if asset.type === 'VIDEO'}
                <span class="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 text-xs text-white">&#9654;</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>

      {#if !finished}
        <div class="flex justify-center py-6">
          <button
            type="button"
            class="rounded-full bg-neutral-200 px-6 py-2 font-medium hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            onclick={loadMore}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      {/if}
    {/if}
  </main>
</div>

{#if current}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
    {#key current.id}
      {#if current.type === 'VIDEO'}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src="/api/assets/{current.id}/video/playback" controls autoplay class="max-h-full max-w-full"></video>
      {:else}
        <img
          src="/api/assets/{current.id}/thumbnail?size=preview"
          alt={current.originalFileName}
          class="max-h-full max-w-full object-contain"
        />
      {/if}
    {/key}

    <button
      type="button"
      class="absolute top-4 right-4 rounded-full bg-white/20 px-4 py-2 text-white hover:bg-white/30"
      onclick={() => (openIndex = undefined)}
    >
      Close
    </button>
    {#if openIndex !== undefined && openIndex > 0}
      <button
        type="button"
        class="absolute top-1/2 left-4 -translate-y-1/2 rounded-full bg-white/20 px-4 py-3 text-2xl text-white hover:bg-white/30"
        aria-label="Previous"
        onclick={() => step(-1)}
      >
        &lsaquo;
      </button>
    {/if}
    {#if openIndex !== undefined && openIndex < assets.length - 1}
      <button
        type="button"
        class="absolute top-1/2 right-4 -translate-y-1/2 rounded-full bg-white/20 px-4 py-3 text-2xl text-white hover:bg-white/30"
        aria-label="Next"
        onclick={() => step(1)}
      >
        &rsaquo;
      </button>
    {/if}
  </div>
{/if}
