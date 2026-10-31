<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { appSettings } from '$lib/stores/app-settings.svelte';
  import FilterBar from '../FilterBar.svelte';
  import FolderHeader from '../FolderHeader.svelte';
  import Gallery from '../Gallery.svelte';
  import MediaViewer from '../MediaViewer.svelte';
  import PersonPortrait from '../PersonPortrait.svelte';
  import {
    assetsUrl,
    defaultQuery,
    favouritesFirst,
    PAGE_SIZE,
    setFavorite,
    type AssetQuery,
    type FolderAsset,
    type FolderSubfolder,
  } from '../folder-types';

  interface Props {
    folder: string;
    initialAssets: FolderAsset[];
    subfolders: FolderSubfolder[];
    flattenSubfolders: boolean;
    initialFailed: boolean;
  }

  let { folder, initialAssets, subfolders, flattenSubfolders, initialFailed }: Props = $props();

  const parts = folder.split('/');
  const topFolder = parts[0];
  const title = parts.join(' / ');
  const backHref = parts.length > 1 ? `/folders/${encodeURIComponent(topFolder)}${parts.length > 2 ? `?sub=${encodeURIComponent(parts.slice(1, -1).join('/'))}` : ''}` : '/folders';

  let query = $state<AssetQuery>(defaultQuery());
  let assets = $state<FolderAsset[]>(initialAssets);
  let page = $state(0);
  let finished = $state(initialAssets.length < PAGE_SIZE);
  let loading = $state(false);
  let failed = $state(initialFailed);
  let openIndex = $state<number | undefined>();
  let initialised = false;

  const filtersActive = $derived(
    Object.entries(query).some(([key, value]) => !['sort', 'dir', 'typeFirst'].includes(key) && value !== ''),
  );

  const fetchPage = async (next: number) => {
    const response = await fetch(assetsUrl(folder, query, next));
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

  // the first page comes from the route loader; every later change of the controls refetches (text is debounced)
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

  const toggleFavorite = async (asset: FolderAsset) => {
    if (!(await setFavorite(asset, !asset.isFavorite))) {
      return;
    }
    // pin to the top right away, and keep the viewer on the same file
    const currentId = openIndex === undefined ? undefined : assets[openIndex]?.id;
    assets = favouritesFirst(assets);
    if (currentId) {
      openIndex = assets.findIndex((candidate) => candidate.id === currentId);
    }
  };

  // only a top-level folder has the choice; inside a subfolder everything below is folded anyway
  const toggleSubfolders = async () => {
    const response = await fetch('/api/view/folder-people/mode', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: topFolder, flattenSubfolders: !flattenSubfolders }),
    });
    if (response.ok) {
      await invalidateAll();
    }
  };

  const setCover = async (asset: FolderAsset) => {
    const response = await fetch('/api/view/folder-people/cover', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: topFolder, assetId: asset.id }),
    });
    return response.ok;
  };
</script>

<svelte:head>
  <title>{title} – {appSettings.title}</title>
</svelte:head>

<div class="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
  <FolderHeader {title} {backHref} />

  <main class="mx-auto max-w-[2000px] space-y-6 p-4 sm:p-6">
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1"><FilterBar bind:query /></div>
      {#if parts.length === 1}
        <button
          type="button"
          class="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          aria-pressed={!flattenSubfolders}
          onclick={toggleSubfolders}
        >
          Subfolders: {flattenSubfolders ? 'folded in' : 'shown'}
        </button>
      {/if}
    </div>

    {#if subfolders.length > 0 && !filtersActive}
      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {#each subfolders as sub (sub.path)}
          <li>
            <a
              href="/folders/{encodeURIComponent(topFolder)}?sub={encodeURIComponent(parts.slice(1).concat(sub.name).join('/'))}"
              class="group relative block overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5"
            >
              <PersonPortrait assetId={sub.assetId} faceBox={null} alt={sub.name} />
              <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-white">
                <p class="truncate font-semibold">{sub.name}</p>
                <p class="text-xs text-white/70">{sub.assetCount} items</p>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    {/if}

    {#if failed}
      <p class="py-16 text-center text-neutral-500">Could not load this folder.</p>
    {:else if assets.length === 0 && !loading}
      <p class="py-16 text-center text-neutral-500">
        {filtersActive || query.q ? 'Nothing matches these filters.' : 'Nothing in this folder.'}
      </p>
    {:else}
      <Gallery {assets} onopen={(index) => (openIndex = index)} onfavorite={toggleFavorite} />

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
  <MediaViewer
    {assets}
    bind:index={openIndex}
    onclose={() => (openIndex = undefined)}
    onfavorite={toggleFavorite}
    oncover={setCover}
  />
{/if}
