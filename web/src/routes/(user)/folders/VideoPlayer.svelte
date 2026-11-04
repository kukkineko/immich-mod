<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    STORED,
    attachStream,
    playbackUrl,
    saveQuality,
    savedQuality,
    type Quality,
    type VideoStream,
  } from './video-stream';
  import { videoUi } from './video-ui.svelte';

  interface Props {
    assetId: string;
    name: string;
    /** a stored encoded copy exists and is played in preference to live encoding */
    encoded: boolean;
  }

  let { assetId, name, encoded }: Props = $props();

  let failed = $state(false);
  let buffering = $state(true);
  let element = $state<HTMLVideoElement>();
  // set when the live encoded stream is not available; then the stored encoded copy plays
  let fallback = $state(false);
  let qualities = $state<Quality[]>([]);
  let quality = $state(savedQuality());
  let stream: VideoStream | undefined;

  const stopStream = () => {
    stream?.destroy();
    stream = undefined;
  };

  const connect = async () => {
    if (!element) {
      return;
    }
    stopStream();
    qualities = [];
    failed = false;
    buffering = true;
    if (encoded && quality === STORED) {
      fallback = true;
      return;
    }
    const video = element;
    const attached = await attachStream(video, assetId, {
      onQualities: (list) => (qualities = list),
      onFailed: () => (fallback = true),
    });
    if (attached) {
      stream = attached;
    } else {
      fallback = true;
    }
  };

  // one connection per video, and a new one when the viewer moves to another video
  $effect(() => {
    void assetId;
    fallback = false;
    void connect();
    return stopStream;
  });

  const choose = (key: string) => {
    const wasStored = fallback && !stream;
    quality = key;
    saveQuality(key);
    if (key === STORED) {
      stopStream();
      qualities = [];
      fallback = true;
    } else if (wasStored) {
      fallback = false;
      void connect();
    } else {
      stream?.setQuality(key);
    }
  };

  // the viewer's toolbar shows the quality menu; this keeps it in step with what is playing
  $effect(() => {
    videoUi.encoded = encoded;
    videoUi.qualities = qualities;
    videoUi.quality = quality;
    videoUi.choose = choose;
    videoUi.active = true;
    return () => {
      videoUi.active = false;
      videoUi.choose = undefined;
    };
  });

  const onerror = () => {
    if (fallback) {
      failed = true;
      buffering = false;
    } else if (!stream) {
      fallback = true;
    }
  };

  // stop the download and playback when the viewer moves on
  onDestroy(() => {
    stopStream();
    if (element) {
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
  });
</script>

<!-- full-size box so the video can be limited to the screen; only the media itself takes clicks, the rest closes the viewer -->
<div class="pointer-events-none relative flex h-full w-full items-center justify-center">
  {#if failed}
    <div
      class="pointer-events-auto flex flex-col items-center gap-3 rounded-2xl bg-neutral-900 p-8 text-center text-white"
    >
      <p class="font-semibold">This video can't be played in the browser.</p>
      <p class="text-sm text-neutral-400">{name}</p>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-full bg-white/20 px-4 py-2 hover:bg-white/30"
          onclick={() => {
            fallback = false;
            failed = false;
            void connect();
          }}
        >
          Try again
        </button>
        <a
          class="rounded-full bg-white/20 px-4 py-2 hover:bg-white/30"
          href="/api/assets/{assetId}/original"
          download={name}
        >
          Download
        </a>
      </div>
    </div>
  {:else}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={element}
      src={fallback ? playbackUrl(assetId) : undefined}
      poster="/api/assets/{assetId}/thumbnail?size=preview"
      controls
      autoplay
      playsinline
      preload="metadata"
      class="pointer-events-auto max-h-full max-w-full"
      {onerror}
      onloadeddata={() => (buffering = false)}
      onwaiting={() => (buffering = true)}
      onplaying={() => (buffering = false)}
    ></video>
    {#if buffering}
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white"></div>
      </div>
    {/if}
  {/if}
</div>
