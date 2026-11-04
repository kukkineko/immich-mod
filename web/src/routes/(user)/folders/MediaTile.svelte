<script lang="ts">
  import { progressive } from '$lib/utils/progressive-image';
  import { aspectRatio, formatDuration, pictureSources, type FolderAsset } from './folder-types';
  import { attachStream, playbackUrl, type VideoStream } from './video-stream';

  interface Props {
    asset: FolderAsset;
    onopen: () => void;
    onfavorite: () => void;
  }

  let { asset, onopen, onfavorite }: Props = $props();

  let previewing = $state(false);
  let previewFailed = $state(false);
  let sourceIndex = $state(0);
  const sources = $derived(pictureSources(asset.id, asset.type === 'IMAGE'));
  const imageFailed = $derived(sourceIndex >= sources.length);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let touchPreviewed = false;

  // the preview plays the smallest encoded stream; if streaming is off, the stored encoded copy. Never the original.
  const previewStream = (video: HTMLVideoElement, id: string) => {
    let stream: VideoStream | undefined;
    let gone = false;
    const fallback = () => {
      video.src = playbackUrl(id);
      void video.play().catch(() => undefined);
    };
    void attachStream(video, id, { preview: true, onFailed: fallback }).then((attached) => {
      if (gone) {
        attached?.destroy();
      } else if (attached) {
        stream = attached;
      } else {
        fallback();
      }
    });
    return {
      destroy() {
        gone = true;
        stream?.destroy();
      },
    };
  };

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

  let startX = 0;
  let startY = 0;

  const ontouchstart = (event: TouchEvent) => {
    touchPreviewed = false;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      touchPreviewed = true;
      start();
    }, 250);
  };

  // a finger that travels is scrolling, not holding
  const ontouchmove = (event: TouchEvent) => {
    if (Math.hypot(event.touches[0].clientX - startX, event.touches[0].clientY - startY) > 12) {
      stop();
    }
  };

  // some browsers cancel the touch when a long press begins (their own press menu); keep playing then and stop
  // as soon as the user touches or scrolls anything else
  const ontouchcancel = () => {
    if (!previewing) {
      stop();
      return;
    }
    const end = () => {
      stop();
      window.removeEventListener('touchstart', end, true);
      window.removeEventListener('scroll', end, true);
    };
    window.addEventListener('touchstart', end, { capture: true, once: true });
    window.addEventListener('scroll', end, { capture: true, once: true });
  };

  // Android Chrome reports a long press as a context menu, and may swallow the touch events that follow;
  // start the preview from that as well, so it does not depend on the touch timer surviving
  const oncontextmenu = (event: MouseEvent) => {
    event.preventDefault();
    if (matchMedia('(hover: none)').matches) {
      clearTimeout(holdTimer);
      touchPreviewed = true;
      start();
      ontouchcancel();
    }
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
    onpointerleave={(event) => event.pointerType !== 'touch' && stop()}
    {ontouchstart}
    {ontouchmove}
    ontouchend={stop}
    {ontouchcancel}
    {oncontextmenu}
    {onclick}
  >
    {#if imageFailed}
      <span class="flex h-full w-full items-center justify-center bg-neutral-800 text-3xl text-neutral-500">
        {isVideo ? '▶' : '□'}
      </span>
    {:else}
      <!-- videos keep their whole frame (portrait clips would be cropped to a square otherwise) -->
      <img
        use:progressive={{
          low: sources[sourceIndex],
          high: `/api/assets/${asset.id}/thumbnail?size=preview`,
        }}
        alt={asset.originalFileName}
        draggable="false"
        class="pointer-events-none h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        onerror={() => sourceIndex++}
      />
    {/if}
    {#if previewing}
      <video
        use:previewStream={asset.id}
        muted
        loop
        autoplay
        playsinline
        preload="auto"
        poster={`/api/assets/${asset.id}/thumbnail?size=preview`}
        class="pointer-events-none absolute inset-0 h-full w-full bg-black object-cover"
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
