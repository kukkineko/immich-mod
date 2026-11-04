<script lang="ts">
  import { assetsUrl, defaultQuery, PAGE_SIZE, type FolderAsset } from '../folders/folder-types';
  import { thumbnail, toSitePhoto, type SitePhoto } from './site-types';

  interface Props {
    /** photos the trip already has, shown as taken */
    existing: Set<string>;
    onadd: (photos: SitePhoto[]) => void;
    onclose: () => void;
  }

  let { existing, onadd, onclose }: Props = $props();

  // every folder at every depth, so a subfolder of a subfolder can be chosen as well
  let folders = $state<{ path: string; count: number }[]>([]);
  let folder = $state('');
  let assets = $state<FolderAsset[]>([]);
  let page = $state(0);
  let finished = $state(true);
  let loading = $state(false);
  let failed = $state(false);
  // picks survive switching folders, so one trip can take photos from several
  let picked = $state<Record<string, SitePhoto>>({});

  const query = { ...defaultQuery(), sort: 'taken' as const, dir: 'asc' as const };

  const fetchPage = async (next: number) => {
    // deep: a folder always lists everything below it, whatever the folder's own subfolder mode is
    const response = await fetch(`${assetsUrl(folder, query, next)}&deep=true`);
    if (!response.ok) {
      throw new Error(String(response.status));
    }
    return (await response.json()) as FolderAsset[];
  };
  const imagesOf = (list: FolderAsset[]) => list.filter((asset) => asset.type === 'IMAGE');

  const openFolder = async (name: string) => {
    folder = name;
    assets = [];
    page = 0;
    failed = false;
    if (!name) {
      return;
    }
    loading = true;
    try {
      const first = await fetchPage(0);
      assets = imagesOf(first);
      // videos are filtered out here, so only a short page from the server means the end
      finished = first.length < PAGE_SIZE;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  };

  const loadMore = async () => {
    loading = true;
    try {
      const more = await fetchPage(page + 1);
      page++;
      assets = [...assets, ...imagesOf(more)];
      finished = more.length < PAGE_SIZE;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  };

  $effect(() => {
    void (async () => {
      const response = await fetch('/api/view/folder-people/tree');
      if (response.ok) {
        folders = (await response.json()) as { path: string; count: number }[];
      }
    })();
  });

  const toggle = (asset: FolderAsset) => {
    if (existing.has(asset.id)) {
      return;
    }
    if (picked[asset.id]) {
      delete picked[asset.id];
    } else {
      picked[asset.id] = toSitePhoto(asset);
    }
  };

  let selecting = $state(false);
  // takes every image below the open folder, not only the pages already on screen
  const selectAll = async () => {
    selecting = true;
    try {
      for (let next = 0; ; next++) {
        const batch = await fetchPage(next);
        for (const asset of imagesOf(batch)) {
          if (!existing.has(asset.id)) {
            picked[asset.id] = toSitePhoto(asset);
          }
        }
        if (batch.length < PAGE_SIZE) {
          break;
        }
      }
    } catch {
      failed = true;
    } finally {
      selecting = false;
    }
  };

  const count = $derived(Object.keys(picked).length);
  const add = () => {
    onadd(Object.values(picked).toSorted((a, b) => a.takenAt.localeCompare(b.takenAt)));
    onclose();
  };

  const buttonClass =
    'rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700';
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && onclose()} />

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true">
  <div class="flex max-h-full w-full max-w-5xl flex-col rounded-2xl bg-neutral-50 shadow-xl dark:bg-neutral-900">
    <div class="flex flex-wrap items-center gap-3 border-b border-neutral-200 p-4 dark:border-neutral-700">
      <h2 class="text-lg font-semibold">Add photos</h2>
      <button type="button" class="rounded-full border border-neutral-300 px-3 py-1 text-lg leading-none hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700" aria-label="Close" onclick={onclose}>&#10005;</button>
      <select
        class="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800"
        value={folder}
        onchange={(event) => openFolder(event.currentTarget.value)}
      >
        <option value="">Choose a folder…</option>
        {#each folders as entry (entry.path)}
          {@const parts = entry.path.split('/')}
          <option value={entry.path}>
            {' '.repeat(parts.length - 1)}{parts.at(-1)} ({entry.count})
          </option>
        {/each}
      </select>
      <button type="button" class={buttonClass} disabled={!folder || selecting} onclick={selectAll}>
        {selecting ? 'Selecting…' : 'Select whole folder'}
      </button>
      <button type="button" class={buttonClass} onclick={onclose}>Cancel</button>
      <button
        type="button"
        class="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
        disabled={count === 0}
        onclick={add}
      >
        Add {count}
        {count === 1 ? 'photo' : 'photos'}
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      {#if !folder}
        <p class="py-16 text-center text-neutral-500">
          Pick a folder to choose photos from. You can come back and pick from others.
        </p>
      {:else if failed}
        <p class="py-16 text-center text-neutral-500">Could not load this folder.</p>
      {:else}
        <ul class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {#each assets as asset (asset.id)}
            {@const taken = existing.has(asset.id)}
            <li>
              <button
                type="button"
                class="relative block aspect-square w-full overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-800 {picked[
                  asset.id
                ]
                  ? 'ring-4 ring-blue-500'
                  : ''}"
                disabled={taken}
                aria-pressed={!!picked[asset.id]}
                onclick={() => toggle(asset)}
              >
                <img
                  src={thumbnail(asset.id)}
                  alt={asset.originalFileName}
                  loading="lazy"
                  class="h-full w-full object-cover {taken ? 'opacity-30' : ''}"
                />
                {#if taken}
                  <span class="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] text-white"
                    >in trip</span
                  >
                {:else if picked[asset.id]}
                  <span class="absolute top-1 right-1 rounded-full bg-blue-500 px-1.5 text-xs text-white">&check;</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
        {#if loading}
          <p class="py-6 text-center text-sm text-neutral-500">Loading…</p>
        {:else if !finished && assets.length > 0}
          <div class="flex justify-center py-6">
            <button type="button" class={buttonClass} onclick={loadMore}>Load more</button>
          </div>
        {:else if assets.length === 0}
          <p class="py-16 text-center text-neutral-500">No photos in this folder.</p>
        {/if}
      {/if}
    </div>
  </div>
</div>
