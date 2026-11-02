<script lang="ts">
  import { appSettings } from '$lib/stores/app-settings.svelte';
  import Lightbox from '../Lightbox.svelte';
  import SiteHeader from '../SiteHeader.svelte';
  import { buildSections, formatDay, photoRatio, publicFile, type PublicPhoto } from '../travel-types';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const trip = $derived(data.trip);
  const sections = $derived(trip ? buildSections(trip) : []);
  // the lightbox walks through the photos in page order and shows their captions
  const photos = $derived(
    trip
      ? trip.blocks.flatMap((block) => {
          const photo = trip.photos.find((candidate) => candidate.id === block.id);
          return block.type === 'photo' && photo ? [{ ...photo, caption: block.caption } satisfies PublicPhoto] : [];
        })
      : [],
  );
  let openIndex = $state<number | undefined>();

  const open = (id: string) => {
    const index = photos.findIndex((photo) => photo.id === id);
    openIndex = index === -1 ? undefined : index;
  };

  const heroId = $derived(trip?.assetId ?? photos[0]?.id);
  const places = $derived([...new Set(photos.map((photo) => photo.place).filter(Boolean))].slice(0, 4).join(' · '));
  const range = $derived.by(() => {
    const times = photos.map((photo) => photo.takenAt).toSorted();
    return times.length > 0 ? `${formatDay(times[0])} – ${formatDay(times.at(-1)!)}` : '';
  });
</script>

<svelte:head>
  <title>{trip?.title ?? data.name} – {appSettings.title}</title>
</svelte:head>

<div class="min-h-screen bg-neutral-950 text-white">
  <section class="relative flex h-[65vh] min-h-[22rem] items-end overflow-hidden">
    <SiteHeader back />
    {#if heroId}
      <img src={publicFile(heroId, 'preview')} alt="" class="absolute inset-0 h-full w-full object-cover" />
    {/if}
    <div class="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/20 to-black/40"></div>
    <div class="relative z-10 w-full px-5 pb-10 sm:px-10">
      <h1 class="font-serif text-5xl sm:text-7xl">{trip?.title ?? data.name}</h1>
      {#if trip}
        <p class="mt-3 text-sm tracking-widest text-white/70 uppercase">
          {photos.length} photos{places ? ` · ${places}` : ''}
        </p>
        {#if range}<p class="mt-1 text-xs text-white/50">{range}</p>{/if}
      {/if}
    </div>
  </section>

  <main class="mx-auto max-w-[2000px] px-3 py-10 sm:px-8">
    {#if !trip}
      <p class="py-20 text-center text-white/60">This trip is not public.</p>
    {:else}
      {#if trip.intro || trip.story}
        <div class="mx-auto mb-14 max-w-2xl text-center">
          {#if trip.intro}
            <p class="font-serif text-xl leading-relaxed whitespace-pre-line text-white/85 sm:text-2xl">{trip.intro}</p>
          {/if}
          {#if trip.story}
            <a
              href="/travel/{encodeURIComponent(trip.name)}/story"
              class="mt-6 inline-block rounded-full border border-white/30 px-6 py-2 text-sm tracking-widest uppercase hover:bg-white/10"
            >
              Read the story
            </a>
          {/if}
        </div>
      {/if}

      <div class="space-y-3 sm:space-y-4">
        {#each sections as section, sectionIndex (sectionIndex)}
          {#if section.kind === 'heading'}
            <h2 class="px-1 pt-10 pb-2 font-serif text-3xl sm:text-4xl">{section.text}</h2>
          {:else if section.kind === 'text'}
            <div class="mx-auto max-w-2xl space-y-4 py-6 text-lg leading-relaxed text-white/85">
              {#each section.paragraphs as paragraph, paragraphIndex (paragraphIndex)}
                <p class="whitespace-pre-line">{paragraph}</p>
              {/each}
            </div>
          {:else if section.kind === 'single'}
            <figure class="mx-auto py-3 {section.size === 'wide' ? 'max-w-6xl' : 'max-w-none'}">
              <button type="button" class="block w-full" onclick={() => open(section.photo.id)}>
                <img
                  src={publicFile(section.photo.id, 'preview')}
                  alt={section.photo.name}
                  loading="lazy"
                  class="w-full rounded-xl object-cover {section.size === 'full' ? 'max-h-[90vh]' : 'max-h-[80vh]'}"
                />
              </button>
              {#if section.caption}
                <figcaption class="mt-2 text-center text-sm text-white/60">{section.caption}</figcaption>
              {/if}
            </figure>
          {:else}
            <!-- justified rows: photos keep their own shape, rows fill the width, gaps are identical -->
            <ul class="flex flex-wrap gap-2 [--row-h:160px] sm:gap-3 sm:[--row-h:240px] lg:[--row-h:300px]">
              {#each section.items as item (item.photo.id)}
                {@const ratio = photoRatio(item.photo)}
                <li
                  class="group relative overflow-hidden rounded-xl bg-neutral-900"
                  style="flex: {ratio} 1 calc({ratio} * var(--row-h))"
                >
                  <div style="padding-bottom: {100 / ratio}%"></div>
                  <button
                    type="button"
                    class="absolute inset-0 block h-full w-full"
                    onclick={() => open(item.photo.id)}
                  >
                    <img
                      src={publicFile(item.photo.id, 'preview')}
                      alt={item.photo.name}
                      loading="lazy"
                      class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                    <span
                      class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent {item.caption
                        ? 'opacity-100'
                        : 'opacity-0 transition group-hover:opacity-100'}"
                    ></span>
                    {#if item.caption || item.photo.place}
                      <span
                        class="pointer-events-none absolute right-3 bottom-2 left-3 text-left text-xs text-white {item.caption
                          ? ''
                          : 'opacity-0 transition group-hover:opacity-100'}"
                      >
                        {item.caption ?? item.photo.place}
                      </span>
                    {/if}
                  </button>
                </li>
              {/each}
              <li class="h-0 grow-[10]" aria-hidden="true"></li>
            </ul>
          {/if}
        {/each}
      </div>
    {/if}
  </main>
</div>

{#if openIndex !== undefined}
  <Lightbox {photos} bind:index={openIndex} onclose={() => (openIndex = undefined)} />
{/if}
