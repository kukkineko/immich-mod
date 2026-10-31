<script lang="ts">
  import { appSettings } from '$lib/stores/app-settings.svelte';
  import FolderHeader from './FolderHeader.svelte';
  import MediaTile from './MediaTile.svelte';
  import MediaViewer from './MediaViewer.svelte';
  import PersonPortrait from './PersonPortrait.svelte';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let openIndex = $state<number | undefined>();

  // one flat list for the viewer, in the same order as the groups are shown
  const flat = $derived(data.loose.flatMap((group) => group.assets));
  const offsets = $derived(
    data.loose.map((_, index) =>
      data.loose.slice(0, index).reduce((total, group) => total + group.assets.length, 0),
    ),
  );
</script>

<svelte:head>
  <title>{appSettings.title}</title>
</svelte:head>

<div class="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
  <FolderHeader title={appSettings.title} />

  <main class="mx-auto max-w-[1800px] p-4">
    {#if data.failed}
      <p class="py-16 text-center text-neutral-500">Could not load folders.</p>
    {:else if data.people.length === 0 && flat.length === 0}
      <p class="py-16 text-center text-neutral-500">No folders found.</p>
    {:else}
      {#if data.people.length > 0}
        <ul class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {#each data.people as person (person.key)}
            <li>
              <a
                href="/folders/{encodeURIComponent(person.key)}"
                class="group block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 transition hover:shadow-lg dark:bg-neutral-800 dark:ring-neutral-700"
              >
                <PersonPortrait assetId={person.assetId} faceBox={person.faceBox} alt={person.name} />
                <div class="p-3">
                  <p class="truncate font-semibold">{person.name}</p>
                  <p class="text-sm text-neutral-500">{person.assetCount} items</p>
                </div>
              </a>
            </li>
          {/each}
        </ul>
      {/if}

      {#if flat.length > 0}
        <section class="mt-8" aria-label="Loose media">
          {#each data.loose as group, groupIndex (group.key)}
            {#if group.kind === 'face' && group.assets.length > 1}
              <h2 class="mt-4 mb-1 px-1 text-sm font-medium text-neutral-500">{group.name}</h2>
            {/if}
            <ul class="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {#each group.assets as asset, index (asset.id)}
                <MediaTile {asset} onopen={() => (openIndex = offsets[groupIndex] + index)} />
              {/each}
            </ul>
          {/each}
        </section>
      {/if}
    {/if}
  </main>
</div>

{#if openIndex !== undefined}
  <MediaViewer assets={flat} bind:index={openIndex} onclose={() => (openIndex = undefined)} />
{/if}
