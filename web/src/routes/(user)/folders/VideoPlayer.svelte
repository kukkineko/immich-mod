<script lang="ts">
  import { onDestroy } from 'svelte';

  interface Props {
    assetId: string;
    name: string;
  }

  let { assetId, name }: Props = $props();

  // the transcoded copy plays almost everywhere; fall back to the untouched original
  const sources = $derived([`/api/assets/${assetId}/video/playback`, `/api/assets/${assetId}/original`]);
  let attempt = $state(0);
  let failed = $state(false);
  let buffering = $state(true);
  let element = $state<HTMLVideoElement>();

  const src = $derived(sources[attempt]);

  const onerror = () => {
    if (attempt < sources.length - 1) {
      attempt++;
      buffering = true;
    } else {
      failed = true;
      buffering = false;
    }
  };

  const retry = () => {
    attempt = 0;
    failed = false;
    buffering = true;
    element?.load();
  };

  // stop the download and playback when the viewer moves on
  onDestroy(() => {
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
    <div class="pointer-events-auto flex flex-col items-center gap-3 rounded-2xl bg-neutral-900 p-8 text-center text-white">
      <p class="font-semibold">This video can't be played in the browser.</p>
      <p class="text-sm text-neutral-400">{name}</p>
      <div class="flex gap-2">
        <button type="button" class="rounded-full bg-white/20 px-4 py-2 hover:bg-white/30" onclick={retry}>
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
    {#key src}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={element}
        {src}
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
    {/key}
    {#if buffering}
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white"></div>
      </div>
    {/if}
  {/if}
</div>
