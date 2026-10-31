<script lang="ts">
  import { appSettings } from '$lib/stores/app-settings.svelte';
  import FolderHeader from './FolderHeader.svelte';
  import PersonPortrait from './PersonPortrait.svelte';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<svelte:head>
  <title>{appSettings.title}</title>
</svelte:head>

<div class="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
  <FolderHeader title={appSettings.title} />

  <main class="mx-auto max-w-7xl p-4">
    {#if data.failed}
      <p class="py-16 text-center text-neutral-500">Could not load folders.</p>
    {:else if data.people.length === 0}
      <p class="py-16 text-center text-neutral-500">No folders found.</p>
    {:else}
      <ul class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {#each data.people as person (person.key)}
          <li>
            <a
              href="/folders/{encodeURIComponent(person.key)}"
              class="group block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 transition hover:shadow-lg dark:bg-neutral-800 dark:ring-neutral-700"
            >
              <PersonPortrait assetId={person.assetId} faceBox={person.faceBox} alt={person.name} />
              <div class="p-3">
                <p class="truncate font-semibold">{person.name}</p>
                <p class="text-sm text-neutral-500">
                  {person.assetCount} items{person.kind === 'folder' ? '' : ' · auto-grouped'}
                </p>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </main>
</div>
