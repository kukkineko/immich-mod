<script lang="ts">
  import { appSettings } from '$lib/stores/app-settings.svelte';
  import Lightbox from '../Lightbox.svelte';
  import SiteHeader from '../SiteHeader.svelte';
  import { formatDay, PHOTO_PAGE, photoRatio, publicFile, type PublicPhoto } from '../travel-types';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let photos = $state<PublicPhoto[]>(data.photos);
  let page = $state(0);
  let finished = $state(data.photos.length < PHOTO_PAGE);
  let loading = $state(false);
  let openIndex = $state<number | undefined>();

  const heroId = $derived(data.trip?.assetId ?? photos[0]?.id);
  const places = $derived([...new Set(photos.map((photo) => photo.place).filter(Boolean))].slice(0, 4).join(' · '));
  const range = $derived(
    photos.length > 0 ? `${formatDay(photos[0].takenAt)} – ${formatDay(photos.at(-1)!.takenAt)}` : '',
  );

  const loadMore = async () => {
    loading = true;
    try {
      const response = await fetch(
        `/api/view/public/trips/photos?name=${encodeURIComponent(data.name)}&page=${page + 1}&size=${PHOTO_PAGE}`,
      );
      if (response.ok) {
        const more = (await response.json()) as PublicPhoto[];
        photos = [...photos, ...more];
        page++;
        finished = more.length < PHOTO_PAGE;
      }
    } finally {
      loading = false;
    }
  };
</script>

<svelte:head>
  <title>{data.name} – {appSettings.title}</title>
</svelte:head>

<div class="min-h-screen bg-neutral-950 text-white">
  <section class="relative flex h-[65vh] min-h-[22rem] items-end overflow-hidden">
    <SiteHeader back />
    {#if heroId}
      <img src={publicFile(heroId, 'preview')} alt="" class="absolute inset-0 h-full w-full object-cover" />
    {/if}
    <div class="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/20 to-black/40"></div>
    <div class="relative z-10 w-full px-5 pb-10 sm:px-10">
      <h1 class="font-serif text-5xl sm:text-7xl">{data.name}</h1>
      {#if data.found}
        <p class="mt-3 text-sm tracking-widest text-white/70 uppercase">
          {data.trip?.photoCount ?? photos.length} photos{places ? ` · ${places}` : ''}
        </p>
        {#if range}<p class="mt-1 text-xs text-white/50">{range}</p>{/if}
      {/if}
    </div>
  </section>

  <main class="mx-auto max-w-[2000px] px-3 py-10 sm:px-8">
    {#if !data.found}
      <p class="py-20 text-center text-white/60">This trip is not public.</p>
    {:else}
      <!-- justified rows: photos keep their own shape, rows fill the width, gaps are identical -->
      <ul class="flex flex-wrap gap-2 [--row-h:160px] sm:gap-3 sm:[--row-h:240px] lg:[--row-h:300px]">
        {#each photos as photo, index (photo.id)}
          {@const ratio = photoRatio(photo)}
          <li
            class="group relative overflow-hidden rounded-xl bg-neutral-900"
            style="flex: {ratio} 1 calc({ratio} * var(--row-h))"
          >
            <div style="padding-bottom: {100 / ratio}%"></div>
            <button type="button" class="absolute inset-0 block h-full w-full" onclick={() => (openIndex = index)}>
              <img
                src={publicFile(photo.id, 'preview')}
                alt={photo.name}
                loading="lazy"
                class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              />
              <span class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition group-hover:opacity-100"></span>
              {#if photo.place}
                <span class="pointer-events-none absolute bottom-2 left-3 text-xs text-white opacity-0 transition group-hover:opacity-100">{photo.place}</span>
              {/if}
            </button>
          </li>
        {/each}
        <li class="h-0 grow-[10]" aria-hidden="true"></li>
      </ul>

      {#if !finished}
        <div class="flex justify-center py-10">
          <button type="button" class="rounded-full border border-white/30 px-6 py-2 text-sm hover:bg-white/10" disabled={loading} onclick={loadMore}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      {/if}
    {/if}
  </main>
</div>

{#if openIndex !== undefined}
  <Lightbox {photos} bind:index={openIndex} onclose={() => (openIndex = undefined)} />
{/if}
