<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { appSettings } from '$lib/stores/app-settings.svelte';
  import FolderHeader from '../folders/FolderHeader.svelte';
  import PersonPortrait from '../folders/PersonPortrait.svelte';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let newTitle = $state('');
  let creating = $state(false);
  let failed = $state(false);

  const create = async () => {
    if (!newTitle.trim()) {
      return;
    }
    creating = true;
    failed = false;
    try {
      const response = await fetch('/api/view/site/curated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (response.ok) {
        const { name } = (await response.json()) as { name: string };
        await goto(`/site/${encodeURIComponent(name)}`);
      } else {
        failed = true;
      }
    } catch {
      failed = true;
    } finally {
      creating = false;
    }
  };

  const remove = async (name: string, title: string) => {
    if (!confirm(`Delete the curated trip “${title}”? The photos stay where they are.`)) {
      return;
    }
    const response = await fetch(`/api/view/site/curated?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (response.ok) {
      await invalidateAll();
    }
  };

  const inputClass =
    'min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800';
  const buttonClass =
    'rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700';
  const sectionClass =
    'space-y-4 rounded-2xl border border-neutral-200 bg-white/70 p-4 dark:border-neutral-700 dark:bg-neutral-800/50';
</script>

<svelte:head>
  <title>Public site – {appSettings.title}</title>
</svelte:head>

<div class="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
  <FolderHeader title="Public site" backHref="/folders" />

  <main class="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
    {#if appSettings.mode !== 'travel'}
      <p
        class="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      >
        The public site is off. Switch the mode to “travel” in the folder settings to show it.
      </p>
    {/if}

    <section class={sectionClass}>
      <h2 class="text-lg font-semibold">Curated trips</h2>
      <p class="text-sm text-neutral-500">
        A curated trip takes photos from any folder. It only appears on the public site once it is published.
      </p>
      <form
        class="flex flex-wrap gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <input class={inputClass} bind:value={newTitle} placeholder="Name of a new curated trip" maxlength="200" />
        <button type="submit" class={buttonClass} disabled={creating || !newTitle.trim()}>Create</button>
      </form>
      {#if failed}<p class="text-sm text-red-600">Could not create the trip.</p>{/if}

      {#if data.curated.length > 0}
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {#each data.curated as trip (trip.name)}
            <li class="space-y-2">
              <a
                href="/site/{encodeURIComponent(trip.name)}"
                class="group relative block overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5"
              >
                <PersonPortrait assetId={trip.assetId} faceBox={null} alt={trip.title} />
                <div
                  class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-white"
                >
                  <p class="truncate font-semibold">{trip.title}</p>
                  <p class="text-xs text-white/70">
                    {trip.photoCount} photos · {trip.published ? 'published' : 'draft'}
                  </p>
                </div>
              </a>
              <button
                type="button"
                class="text-xs text-neutral-500 hover:text-red-600"
                onclick={() => remove(trip.name, trip.title)}
              >
                Delete
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class={sectionClass}>
      <h2 class="text-lg font-semibold">Folder trips</h2>
      <p class="text-sm text-neutral-500">
        Every top-level folder is a trip. Open one to choose single photos, order them and add texts, even if the folder
        itself is not public.
      </p>
      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {#each data.people as person (person.key)}
          <li>
            <a
              href="/site/{encodeURIComponent(person.name)}"
              class="group relative block overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5"
            >
              <PersonPortrait assetId={person.assetId} faceBox={null} alt={person.name} />
              <div
                class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-white"
              >
                <p class="truncate font-semibold">{person.name}</p>
                <p class="text-xs text-white/70">
                  {person.assetCount} items · {person.isPublic ? 'public' : 'private'}
                </p>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  </main>
</div>
