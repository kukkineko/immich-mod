<script lang="ts">
  import { ladder, progressive } from '$lib/utils/progressive-image';
  import { appSettings } from '$lib/stores/app-settings.svelte';
  import SiteHeader from '../../SiteHeader.svelte';
  import { renderStory } from '../../story-markdown';
  import { publicFile } from '../../travel-types';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const trip = $derived(data.trip);
</script>

<svelte:head>
  <title>{trip?.title ?? data.name} – {appSettings.title}</title>
</svelte:head>

<div class="min-h-screen bg-neutral-950 text-white">
  <section class="relative flex h-[50vh] min-h-[18rem] items-end overflow-hidden">
    <SiteHeader back />
    {#if trip?.assetId}
      <img
        use:progressive={{ steps: ladder((size) => publicFile(trip.assetId!, size)) }}
        alt=""
        class="absolute inset-0 h-full w-full object-cover"
      />
    {/if}
    <div class="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/30 to-black/40"></div>
    <div class="relative z-10 w-full px-5 pb-10 sm:px-10">
      <h1 class="font-serif text-4xl sm:text-6xl">{trip?.title ?? data.name}</h1>
    </div>
  </section>

  <main class="mx-auto max-w-2xl px-5 py-12 text-lg leading-relaxed text-white/85">
    {#if !trip?.story}
      <p class="py-20 text-center text-white/60">There is no story for this trip.</p>
    {:else}
      <!-- renderStory escapes everything it does not generate itself -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html renderStory(trip.story)}
      <p class="mt-14 text-center">
        <a
          href="/travel/{encodeURIComponent(trip.name)}"
          class="text-sm tracking-widest text-white/60 uppercase hover:text-white"
        >
          &larr; All photos
        </a>
      </p>
    {/if}
  </main>
</div>
