<script lang="ts">
  import AssetInfo from './AssetInfo.svelte';
  import VideoPlayer from './VideoPlayer.svelte';
  import { pictureSources, type FolderAsset } from './folder-types';

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
  let sourceIndex = $state(0);
  const pictures = $derived(current ? pictureSources(current.id) : []);
  // a new picture starts again from the best source
  $effect(() => {
    void current?.id;
    sourceIndex = 0;
  });

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

  const buttonClass = 'rounded-full bg-white/20 px-4 py-2 text-white hover:bg-white/30';
</script>

<svelte:window {onkeydown} />

{#if current}
  <div class="fixed inset-0 z-50 bg-black/95" role="dialog" aria-modal="true" aria-label={current.originalFileName}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="flex h-full w-full items-center justify-center" onclick={onbackdrop}>
      {#key current.id}
        {#if current.type === 'VIDEO'}
          <VideoPlayer assetId={current.id} name={current.originalFileName} />
        {:else}
          <img
            src={pictures[Math.min(sourceIndex, pictures.length - 1)]}
            onerror={() => sourceIndex++}
            alt={current.originalFileName}
            class="max-h-full max-w-full object-contain"
          />
        {/if}
      {/key}
    </div>

    <div class="absolute top-4 left-4 flex flex-wrap gap-2">
      <button
        type="button"
        class="{buttonClass} {current.isFavorite ? 'text-amber-300' : ''}"
        aria-pressed={current.isFavorite}
        onclick={() => onfavorite(current)}
      >
        {current.isFavorite ? '★ Favourite' : '☆ Favourite'}
      </button>
      <button type="button" class={buttonClass} onclick={() => (showInfo = !showInfo)} aria-pressed={showInfo}>
        Info
      </button>
      <a class={buttonClass} href="/api/assets/{current.id}/original" download={current.originalFileName}>Download</a>
      {#if oncover}
        <button type="button" class={buttonClass} disabled={coverState === 'saving'} onclick={makeCover}>
          {coverState === 'done'
            ? 'Folder image set'
            : coverState === 'failed'
              ? 'Could not set image'
              : 'Set as folder image'}
        </button>
      {/if}
    </div>

    <button type="button" class="absolute top-4 z-20 {buttonClass} {showInfo ? 'right-84' : 'right-4'}" onclick={onclose}>
      Close
    </button>

    {#if index > 0}
      <button
        type="button"
        class="absolute top-1/2 left-4 -translate-y-1/2 rounded-full bg-white/20 px-4 py-3 text-2xl text-white hover:bg-white/30"
        aria-label="Previous"
        onclick={() => step(-1)}
      >
        &lsaquo;
      </button>
    {/if}
    {#if index < assets.length - 1}
      <button
        type="button"
        class="absolute top-1/2 {showInfo
          ? 'right-84'
          : 'right-4'} -translate-y-1/2 rounded-full bg-white/20 px-4 py-3 text-2xl text-white hover:bg-white/30"
        aria-label="Next"
        onclick={() => step(1)}
      >
        &rsaquo;
      </button>
    {/if}

    {#if showInfo}
      <AssetInfo asset={current} />
    {/if}
  </div>
{/if}
