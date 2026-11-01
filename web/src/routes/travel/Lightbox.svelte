<script lang="ts">
  import { formatDay, publicFile, type PublicPhoto } from './travel-types';

  interface Props {
    photos: PublicPhoto[];
    index: number;
    onclose: () => void;
  }

  let { photos, index = $bindable(), onclose }: Props = $props();

  const photo = $derived(photos[index]);
  let fullLoaded = $state(false);

  $effect(() => {
    void photo?.id;
    fullLoaded = false;
  });

  const step = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < photos.length) {
      index = next;
    }
  };

  const onkeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onclose();
    } else if (event.key === 'ArrowLeft') {
      step(-1);
    } else if (event.key === 'ArrowRight') {
      step(1);
    }
  };

  const onbackdrop = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      onclose();
    }
  };

  const arrow = 'absolute z-10 rounded-full bg-white/10 px-4 py-3 text-2xl backdrop-blur hover:bg-white/25';
  const fit = 'absolute max-h-[calc(100%-1rem)] max-w-[calc(100%-1rem)] object-contain';
</script>

<svelte:window {onkeydown} />

{#if photo}
  <div class="fixed inset-0 z-50 flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label={photo.name}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6" onclick={onbackdrop}>
      {#key photo.id}
        <img src={publicFile(photo.id, 'preview')} alt={photo.name} class={fit} />
        <!-- the full resolution file fades in over the preview once it has arrived -->
        <img
          src={publicFile(photo.id, 'original')}
          alt=""
          onload={() => (fullLoaded = true)}
          class="{fit} transition-opacity duration-500 {fullLoaded ? 'opacity-100' : 'opacity-0'}"
        />
      {/key}

      {#if index > 0}
        <button type="button" class="{arrow} left-3" aria-label="Previous" onclick={() => step(-1)}>&lsaquo;</button>
      {/if}
      {#if index < photos.length - 1}
        <button type="button" class="{arrow} right-3" aria-label="Next" onclick={() => step(1)}>&rsaquo;</button>
      {/if}
      <button type="button" class="absolute top-3 right-3 z-10 rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur hover:bg-white/25" onclick={onclose}>Close</button>
    </div>

    <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-3 text-sm text-white/70 sm:px-8">
      <p>
        {#if photo.place}<span class="font-serif text-base text-white">{photo.place}</span> &middot; {/if}{formatDay(photo.takenAt)}
      </p>
      <p class="text-xs">{[photo.camera, photo.settings].filter(Boolean).join('   ')}</p>
    </div>
  </div>
{/if}
