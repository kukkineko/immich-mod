<script lang="ts">
  interface FaceBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  interface Props {
    assetId: string | null;
    faceBox: FaceBox | null;
    alt: string;
  }

  let { assetId, faceBox, alt }: Props = $props();

  // natural size of the loaded image, needed to turn the face fractions into a square crop
  let size = $state<{ width: number; height: number } | undefined>();

  const crop = $derived.by(() => {
    if (!faceBox || !size) {
      return;
    }
    const { width, height } = size;
    const cx = ((faceBox.x1 + faceBox.x2) / 2) * width;
    const cy = ((faceBox.y1 + faceBox.y2) / 2) * height;
    const faceSize = Math.max((faceBox.x2 - faceBox.x1) * width, (faceBox.y2 - faceBox.y1) * height);
    // leave some room around the face, but never crop outside the image
    const side = Math.min(faceSize * 2.2, width, height);
    const left = Math.min(Math.max(cx - side / 2, 0), width - side);
    const top = Math.min(Math.max(cy - side / 2, 0), height - side);
    return {
      width: (width / side) * 100,
      left: (-left / side) * 100,
      top: (-top / side) * 100,
    };
  });
</script>

<div class="relative aspect-square w-full overflow-hidden bg-neutral-200 dark:bg-neutral-800">
  {#if assetId}
    <img
      src="/api/assets/{assetId}/thumbnail?size=preview"
      {alt}
      loading="lazy"
      draggable="false"
      onload={(event) => {
        const img = event.currentTarget as HTMLImageElement;
        size = { width: img.naturalWidth, height: img.naturalHeight };
      }}
      class={crop ? 'absolute max-w-none' : 'h-full w-full object-cover'}
      style={crop ? `width: ${crop.width}%; left: ${crop.left}%; top: ${crop.top}%;` : undefined}
    />
  {/if}
</div>
