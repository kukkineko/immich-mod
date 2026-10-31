<script lang="ts">
  import { formatDuration, type FolderAsset } from './folder-types';

  interface Props {
    asset: FolderAsset;
    onopen: () => void;
  }

  let { asset, onopen }: Props = $props();

  let previewing = $state(false);
  let previewFailed = $state(false);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let touchPreviewed = false;

  const isVideo = $derived(asset.type === 'VIDEO');

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

<li class="relative aspect-square overflow-hidden bg-neutral-200 dark:bg-neutral-800">
  <button
    type="button"
    class="block h-full w-full select-none [-webkit-touch-callout:none]"
    {onpointerenter}
    onpointerleave={stop}
    {ontouchstart}
    ontouchend={stop}
    ontouchcancel={stop}
    oncontextmenu={(event) => isVideo && event.preventDefault()}
    {onclick}
  >
    <img
      src="/api/assets/{asset.id}/thumbnail?size=preview"
      alt={asset.originalFileName}
      loading="lazy"
      draggable="false"
      class="h-full w-full object-cover"
    />
    {#if previewing}
      <video
        src="/api/assets/{asset.id}/video/playback"
        muted
        loop
        autoplay
        playsinline
        preload="none"
        class="absolute inset-0 h-full w-full object-cover"
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
</li>
