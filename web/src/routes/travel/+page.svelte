<script lang="ts">
  import { appSettings } from '$lib/stores/app-settings.svelte';
  import SiteHeader from './SiteHeader.svelte';
  import { publicFile } from './travel-types';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const hero = $derived(data.trips.find((trip) => trip.assetId));
</script>

<svelte:head>
  <title>{appSettings.title}</title>
</svelte:head>

<div class="min-h-screen bg-neutral-950 text-white">
  <section class="relative flex h-[85vh] min-h-[28rem] items-end overflow-hidden">
    <SiteHeader />
    {#if hero?.assetId}
      <img src={publicFile(hero.assetId, 'preview')} alt="" class="absolute inset-0 h-full w-full scale-105 object-cover" />
    {/if}
    <div class="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/30 to-black/40"></div>
    <div class="relative z-10 w-full px-5 pb-14 sm:px-10">
      <p class="mb-3 text-xs tracking-[0.35em] text-white/70 uppercase">Travel photography</p>
      <h1 class="max-w-3xl font-serif text-5xl leading-tight sm:text-7xl">{appSettings.title}</h1>
      {#if data.trips.length > 0}
        <a href="#trips" class="mt-8 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black transition hover:bg-white/85">
          Explore {data.trips.length} {data.trips.length === 1 ? 'trip' : 'trips'}
        </a>
      {/if}
    </div>
  </section>

  <main id="trips" class="mx-auto max-w-[1800px] px-5 py-16 sm:px-10">
    {#if !data.available}
      <p class="py-20 text-center text-white/60">This site is not public.</p>
    {:else if data.trips.length === 0}
      <p class="py-20 text-center text-white/60">No trips have been published yet.</p>
    {:else}
      <ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {#each data.trips as trip (trip.name)}
          <li>
            <a href="/travel/{encodeURIComponent(trip.name)}" class="group relative block aspect-[4/5] overflow-hidden rounded-3xl bg-neutral-900">
              {#if trip.assetId}
                <img
                  src={publicFile(trip.assetId, 'preview')}
                  alt={trip.name}
                  loading="lazy"
                  class="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                />
              {/if}
              <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent"></div>
              <div class="absolute inset-x-0 bottom-0 p-6">
                <h2 class="font-serif text-3xl">{trip.name}</h2>
                <p class="mt-1 text-sm tracking-widest text-white/70 uppercase">{trip.photoCount} photos</p>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </main>

  <footer class="px-5 py-10 text-center text-xs tracking-widest text-white/40 uppercase sm:px-10">
    &copy; {new Date().getFullYear()} {appSettings.title}
  </footer>
</div>
