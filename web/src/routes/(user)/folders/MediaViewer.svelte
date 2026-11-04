<script lang="ts">
  import AssetInfo from './AssetInfo.svelte';
  import VideoPlayer from './VideoPlayer.svelte';
  import VideoQuality from './VideoQuality.svelte';
  import { ladder, progressive } from '$lib/utils/progressive-image';
  import { assetPicture, type FolderAsset } from './folder-types';

  interface Props {
    assets: FolderAsset[];
    index: number;
    onclose: () => void;
    onfavorite: (asset: FolderAsset) => void;
    /** only offered where the media belongs to a folder */
    oncover?: (asset: FolderAsset) => Promise<boolean>;
  }

  let { assets, index = $bindable(), onclose, onfavorite, oncover }: Props = $props();

  let showInfo = $state(false);
  let coverState = $state<'idle' | 'saving' | 'done' | 'failed'>('idle');

  const current = $derived(assets[index]);

  const step = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < assets.length) {
      index = next;
    }
  };

  const onkeydown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && event.target.matches('input, select, textarea')) {
      return;
    }
    if (event.key === 'Escape') {
      onclose();
    } else if (event.key === 'ArrowLeft') {
      step(-1);
    } else if (event.key === 'ArrowRight') {
      step(1);
    } else if (event.key === 'i') {
      showInfo = !showInfo;
    } else if (event.key === 'f') {
      onfavorite(current);
    }
  };

  // a click on the dark area around the media closes the viewer, clicks on the media itself do not
  const onbackdrop = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      onclose();
    }
  };

  const makeCover = async () => {
    coverState = 'saving';
    coverState = (await oncover?.(current)) ? 'done' : 'failed';
    setTimeout(() => (coverState = 'idle'), 2500);
  };

  const buttonClass =
    'rounded-full bg-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/30 sm:px-4 sm:py-2 sm:text-base';
</script>

<svelte:window {onkeydown} />

{#if current}
  <div class="fixed inset-0 z-50 bg-black/95" role="dialog" aria-modal="true" aria-label={current.originalFileName}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="flex h-full w-full items-center justify-center" onclick={onbackdrop}>
      {#key current.id}
        {#if current.type === 'VIDEO'}
          <VideoPlayer assetId={current.id} name={current.originalFileName} encoded={!!current.encodedVideo} />
        {:else}
          <img
            use:progressive={{ steps: ladder((size) => assetPicture(current.id, size)) }}
            alt={current.originalFileName}
            class="h-full w-full object-contain"
          />
        {/if}
      {/key}
    </div>

    <!-- one bar at the top: actions on the left, quality and the close X on the right, never overlapping -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-4 {showInfo
        ? 'sm:right-80'
        : ''}"
    >
      <div class="pointer-events-auto flex min-w-0 flex-wrap gap-2">
        <button
          type="button"
          class="{buttonClass} {current.isFavorite ? 'text-amber-300' : ''}"
          aria-pressed={current.isFavorite}
          aria-label="Favourite"
          onclick={() => onfavorite(current)}
        >
          {current.isFavorite ? '★' : '☆'}<span class="hidden sm:inline"> Favourite</span>
        </button>
        <button type="button" class={buttonClass} onclick={() => (showInfo = !showInfo)} aria-pressed={showInfo}>
          Info
        </button>
        <a class={buttonClass} href="/api/assets/{current.id}/original" download={current.originalFileName}>
          Download
        </a>
        {#if oncover}
          <button type="button" class={buttonClass} disabled={coverState === 'saving'} onclick={makeCover}>
            {coverState === 'done' ? 'Folder image set' : coverState === 'failed' ? 'Could not set image' : 'Set as folder image'}
          </button>
        {/if}
      </div>
      <div class="pointer-events-auto flex shrink-0 items-start gap-2">
        {#if current.type === 'VIDEO'}
          <VideoQuality />
        {/if}
        <button type="button" class="{buttonClass} px-3.5" aria-label="Close" onclick={onclose}>&#10005;</button>
      </div>
    </div>

    {#if index > 0}
      <button
        type="button"
        class="absolute top-1/2 left-2 -translate-y-1/2 sm:left-4 rounded-full bg-white/20 px-4 py-3 text-2xl text-white hover:bg-white/30"
        aria-label="Previous"
        onclick={() => step(-1)}
      >
        &lsaquo;
      </button>
    {/if}
    {#if index < assets.length - 1}
      <button
        type="button"
        class="absolute top-1/2 right-2 sm:right-4 {showInfo
          ? 'sm:right-84'
          : ''} -translate-y-1/2 rounded-full bg-white/20 px-4 py-3 text-2xl text-white hover:bg-white/30"
        aria-label="Next"
        onclick={() => step(1)}
      >
        &rsaquo;
      </button>
    {/if}

    {#if showInfo}
      <AssetInfo asset={current} onclose={() => (showInfo = false)} />
    {/if}
  </div>
{/if}
