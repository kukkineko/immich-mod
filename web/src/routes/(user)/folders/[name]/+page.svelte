<script lang="ts">
  import { appSettings } from '$lib/stores/app-settings.svelte';
  import FolderHeader from '../FolderHeader.svelte';
  import MediaTile from '../MediaTile.svelte';
  import MediaViewer from '../MediaViewer.svelte';
  import {
    assetsUrl,
    defaultQuery,
    PAGE_SIZE,
    type AssetQuery,
    type FolderAsset,
    type SortKey,
  } from '../folder-types';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const title = $derived(data.key);

  let query = $state<AssetQuery>(defaultQuery());
  let assets = $state<FolderAsset[]>([]);
  let page = $state(0);
  let finished = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  let filtersOpen = $state(false);
  let openIndex = $state<number | undefined>();
  let initialised = false;

  const filtersActive = $derived(
    Object.entries(query).some(([key, value]) => !['sort', 'dir', 'typeFirst'].includes(key) && value !== ''),
  );

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'taken', label: 'Date taken' },
    { value: 'updated', label: 'Date updated' },
    { value: 'name', label: 'Name' },
    { value: 'size', label: 'File size' },
    { value: 'duration', label: 'Video length' },
  ];

  const fetchPage = async (next: number) => {
    const response = await fetch(assetsUrl(data.key, query, next));
    if (!response.ok) {
      throw new Error(String(response.status));
    }
    return (await response.json()) as FolderAsset[];
  };

  const reload = async () => {
    loading = true;
    failed = false;
    try {
      const first = await fetchPage(0);
      assets = first;
      page = 0;
      finished = first.length < PAGE_SIZE;
      openIndex = undefined;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  };

  const loadMore = async () => {
    loading = true;
    try {
      const next = page + 1;
      const more = await fetchPage(next);
      assets = [...assets, ...more];
      page = next;
      finished = more.length < PAGE_SIZE;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  };

  // first page comes from the route loader; every later change of the controls refetches (text is debounced)
  $effect.pre(() => {
    if (!initialised) {
      assets = data.assets;
      finished = data.assets.length < PAGE_SIZE;
      failed = data.failed;
    }
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const snapshot = JSON.stringify(query);
    if (!initialised) {
      initialised = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void reload(), snapshot ? 300 : 0);
    return () => clearTimeout(timer);
  });

  const reset = () => (query = defaultQuery());

  const inputClass =
    'w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800';
</script>

<svelte:head>
  <title>{title} – {appSettings.title}</title>
</svelte:head>

<div class="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
  <FolderHeader {title} backHref="/folders" />

  <section class="border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
    <div class="flex flex-wrap items-center gap-2">
      <input
        type="search"
        placeholder="Search by name"
        class="{inputClass} max-w-56"
        bind:value={query.q}
        aria-label="Search by name"
      />

      <label class="flex items-center gap-1 text-sm">
        Sort
        <select class={inputClass} bind:value={query.sort} aria-label="Sort by">
          {#each sortOptions as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>

      <button
        type="button"
        class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-600"
        onclick={() => (query.dir = query.dir === 'desc' ? 'asc' : 'desc')}
        aria-label="Toggle sort direction"
      >
        {query.dir === 'desc' ? '↓ Descending' : '↑ Ascending'}
      </button>

      <label class="flex items-center gap-1 text-sm">
        Show
        <select class={inputClass} bind:value={query.typeFirst} aria-label="Media order">
          <option value="any">Images and videos mixed</option>
          <option value="image">Images first</option>
          <option value="video">Videos first</option>
        </select>
      </label>

      <button
        type="button"
        class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-600"
        onclick={() => (filtersOpen = !filtersOpen)}
        aria-expanded={filtersOpen}
      >
        Filters{filtersActive ? ' •' : ''}
      </button>

      {#if filtersActive || query.q}
        <button type="button" class="text-sm underline" onclick={reset}>Reset</button>
      {/if}
    </div>

    {#if filtersOpen}
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <fieldset class="space-y-1">
          <legend class="text-xs text-neutral-500 uppercase">Date taken</legend>
          <input type="date" class={inputClass} bind:value={query.takenFrom} aria-label="Taken from" />
          <input type="date" class={inputClass} bind:value={query.takenTo} aria-label="Taken until" />
        </fieldset>
        <fieldset class="space-y-1">
          <legend class="text-xs text-neutral-500 uppercase">Date updated</legend>
          <input type="date" class={inputClass} bind:value={query.updatedFrom} aria-label="Updated from" />
          <input type="date" class={inputClass} bind:value={query.updatedTo} aria-label="Updated until" />
        </fieldset>
        <fieldset class="space-y-1">
          <legend class="text-xs text-neutral-500 uppercase">File size (MB)</legend>
          <input type="number" min="0" step="any" placeholder="min" class={inputClass} bind:value={query.minSizeMb} />
          <input type="number" min="0" step="any" placeholder="max" class={inputClass} bind:value={query.maxSizeMb} />
        </fieldset>
        <fieldset class="space-y-1">
          <legend class="text-xs text-neutral-500 uppercase">Video length (seconds)</legend>
          <input type="number" min="0" step="any" placeholder="min" class={inputClass} bind:value={query.minSeconds} />
          <input type="number" min="0" step="any" placeholder="max" class={inputClass} bind:value={query.maxSeconds} />
        </fieldset>
      </div>
    {/if}
  </section>

  <main class="p-1">
    {#if failed}
      <p class="py-16 text-center text-neutral-500">Could not load this folder.</p>
    {:else if assets.length === 0 && !loading}
      <p class="py-16 text-center text-neutral-500">
        {filtersActive || query.q ? 'Nothing matches these filters.' : 'Nothing in this folder.'}
      </p>
    {:else}
      <ul class="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {#each assets as asset, index (asset.id)}
          <MediaTile {asset} onopen={() => (openIndex = index)} />
        {/each}
      </ul>

      {#if loading}
        <p class="py-6 text-center text-sm text-neutral-500">Loading…</p>
      {:else if !finished}
        <div class="flex justify-center py-6">
          <button
            type="button"
            class="rounded-full bg-neutral-200 px-6 py-2 font-medium hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            onclick={loadMore}
          >
            Load more
          </button>
        </div>
      {/if}
    {/if}
  </main>
</div>

{#if openIndex !== undefined}
  <MediaViewer {assets} bind:index={openIndex} onclose={() => (openIndex = undefined)} />
{/if}
