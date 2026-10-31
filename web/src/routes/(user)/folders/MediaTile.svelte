<script lang="ts">
  import { aspectRatio, formatDuration, type FolderAsset } from './folder-types';

  interface Props {
    asset: FolderAsset;
    onopen: () => void;
    onfavorite: () => void;
  }

  let { asset, onopen, onfavorite }: Props = $props();

  let previewing = $state(false);
  let previewFailed = $state(false);
  let imageFailed = $state(false);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let touchPreviewed = false;

  const isVideo = $derived(asset.type === 'VIDEO');
  const ratio = $derived(aspectRatio(asset));

  const start = () => {
    if (isVideo && !previewFailed) {
      previewing = true;
    }
  };

  const stop = () => {
    clearTimeout(holdTimer);
    previewing = false;
  };

  // mouse and pen preview on hover; a finger previews while it is held down on the tile
  const onpointerenter = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
      start();
    }
  };

  const ontouchstart = () => {
    touchPreviewed = false;
    holdTimer = setTimeout(() => {
      touchPreviewed = true;
      start();
    }, 300);
  };

  const onclick = (event: MouseEvent) => {
    // releasing a press-and-hold must not also open the viewer
    if (touchPreviewed) {
      touchPreviewed = false;
      event.preventDefault();
      return;
    }
    stop();
    onopen();
  };
</script>

<li
  class="group relative overflow-hidden rounded-xl bg-neutral-200 shadow-sm ring-1 ring-black/5 dark:bg-neutral-800"
  style="flex: {ratio} 1 calc({ratio} * var(--row-h))"
>
  <div style="padding-bottom: {100 / ratio}%"></div>
  <button
    type="button"
    class="absolute inset-0 block h-full w-full select-none [-webkit-touch-callout:none]"
    {onpointerenter}
    onpointerleave={stop}
    {ontouchstart}
    ontouchend={stop}
    ontouchcancel={stop}
    oncontextmenu={(event) => isVideo && event.preventDefault()}
    {onclick}
  >
    {#if imageFailed}
      <span class="flex h-full w-full items-center justify-center bg-neutral-800 text-3xl text-neutral-500">
        {isVideo ? '▶' : '□'}
      </span>
    {:else}
      <!-- videos keep their whole frame (portrait clips would be cropped to a square otherwise) -->
      <img
        src="/api/assets/{asset.id}/thumbnail?size=preview"
        alt={asset.originalFileName}
        loading="lazy"
        draggable="false"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        onerror={() => (imageFailed = true)}
      />
    {/if}
    {#if previewing}
      <video
        src="/api/assets/{asset.id}/video/playback"
        muted
        loop
        autoplay
        playsinline
        preload="auto"
        class="absolute inset-0 h-full w-full bg-black object-cover"
        onerror={() => {
          previewFailed = true;
          previewing = false;
        }}
      ></video>
    {/if}
    {#if isVideo}
      <span class="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 text-xs text-white">
        &#9654; {formatDuration(asset.duration)}
      </span>
    {/if}
  </button>
  <button
    type="button"
    class="absolute top-2 left-2 rounded-full bg-black/45 px-2 py-1 text-lg leading-none backdrop-blur transition-opacity hover:bg-black/70 {asset.isFavorite
      ? 'text-amber-300 opacity-100'
      : 'text-white opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-80'}"
    aria-label={asset.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
    aria-pressed={asset.isFavorite}
    onclick={onfavorite}
  >
    {asset.isFavorite ? '★' : '☆'}
  </button>
</li>
