<script lang="ts">
  import { appSettings } from '$lib/stores/app-settings.svelte';
  import FilterBar from './FilterBar.svelte';
  import FolderHeader from './FolderHeader.svelte';
  import Gallery from './Gallery.svelte';
  import MediaViewer from './MediaViewer.svelte';
  import PersonPortrait from './PersonPortrait.svelte';
  import { defaultQuery, looseUrl, setFavorite, type AssetQuery, type FolderAsset, type LooseGroup } from './folder-types';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let query = $state<AssetQuery>(defaultQuery());
  let groups = $state<LooseGroup[]>(data.loose);
  let hadLoose = $state(data.loose.length > 0);
  let openIndex = $state<number | undefined>();
  let initialised = false;

  const filtersActive = $derived(JSON.stringify(query) !== JSON.stringify(defaultQuery()));

  // one flat list for the viewer, in the same order as the groups are shown
  const flat = $derived(groups.flatMap((group) => group.assets));
  const offsets = $derived(
    groups.map((_, index) => groups.slice(0, index).reduce((total, group) => total + group.assets.length, 0)),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const snapshot = JSON.stringify(query);
    if (!initialised) {
      initialised = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const response = await fetch(looseUrl(query));
        if (response.ok) {
          groups = (await response.json()) as LooseGroup[];
          openIndex = undefined;
        }
      } catch {
        // keep what is on screen
      }
    }, snapshot ? 300 : 0);
    return () => clearTimeout(timer);
  });

  const toggleFavorite = async (asset: FolderAsset) => {
    if (!(await setFavorite(asset, !asset.isFavorite))) {
      return;
    }
    // pin to the top of its own group right away, and keep the viewer on the same file
    const currentId = openIndex === undefined ? undefined : flat[openIndex]?.id;
    groups = groups.map((group) => ({
      ...group,
      assets: [...group.assets.filter((item) => item.isFavorite), ...group.assets.filter((item) => !item.isFavorite)],
    }));
    if (currentId) {
      openIndex = flat.findIndex((candidate) => candidate.id === currentId);
    }
  };
</script>

<svelte:head>
  <title>{appSettings.title}</title>
</svelte:head>

<div class="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
  <FolderHeader title={appSettings.title} />

  <main class="mx-auto max-w-[2000px] space-y-10 p-4 sm:p-6">
    {#if data.failed}
      <p class="py-16 text-center text-neutral-500">Could not load folders.</p>
    {:else if data.people.length === 0 && !hadLoose}
      <p class="py-16 text-center text-neutral-500">No folders found.</p>
    {:else}
      {#if data.people.length > 0}
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
          {#each data.people as person (person.key)}
            <li>
              <a
                href="/folders/{encodeURIComponent(person.key)}"
                class="group relative block overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl"
              >
                <div class="transition-transform duration-500 group-hover:scale-105">
                  <PersonPortrait assetId={person.assetId} faceBox={person.faceBox} alt={person.name} />
                </div>
                <div
                  class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-12 text-white"
                >
                  <p class="truncate text-lg font-semibold">{person.name}</p>
                  <p class="text-xs text-white/70">{person.assetCount} items</p>
                </div>
              </a>
            </li>
          {/each}
        </ul>
      {/if}

      {#if hadLoose}
        <section class="space-y-4" aria-label="Loose media">
          <h2 class="text-xl font-semibold">Loose media</h2>
          <FilterBar bind:query />

          {#if flat.length === 0}
            <p class="py-10 text-center text-neutral-500">Nothing matches these filters.</p>
          {/if}

          {#each groups as group, groupIndex (group.key)}
            <div class="space-y-2">
              {#if group.kind === 'face' && group.assets.length > 1}
                <h3 class="px-1 text-sm font-medium text-neutral-500">{group.name}</h3>
              {/if}
              <Gallery
                assets={group.assets}
                onopen={(index) => (openIndex = offsets[groupIndex] + index)}
                onfavorite={toggleFavorite}
              />
            </div>
          {/each}
        </section>
      {/if}
    {/if}
  </main>
</div>

{#if openIndex !== undefined}
  <MediaViewer
    assets={flat}
    bind:index={openIndex}
    onclose={() => (openIndex = undefined)}
    onfavorite={toggleFavorite}
  />
{/if}
