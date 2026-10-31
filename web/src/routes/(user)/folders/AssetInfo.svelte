<script lang="ts">
  import { formatBytes, formatDate, formatDuration, type FolderAsset } from './folder-types';

  interface Props {
    asset: FolderAsset;
    onclose: () => void;
  }

  let { asset, onclose }: Props = $props();

  const exif = $derived(asset.exifInfo);
  const width = $derived(exif?.exifImageWidth ?? asset.width);
  const height = $derived(exif?.exifImageHeight ?? asset.height);
  const place = $derived([exif?.city, exif?.state, exif?.country].filter(Boolean).join(', '));
  const camera = $derived([exif?.make, exif?.model].filter(Boolean).join(' '));
  const settings = $derived(
    [
      exif?.fNumber ? `ƒ/${exif.fNumber}` : undefined,
      exif?.exposureTime ? `${exif.exposureTime}s` : undefined,
      exif?.focalLength ? `${exif.focalLength} mm` : undefined,
      exif?.iso ? `ISO ${exif.iso}` : undefined,
    ]
      .filter(Boolean)
      .join('  ·  '),
  );

  const rows = $derived(
    [
      ['Name', asset.originalFileName],
      ['Path', asset.originalPath],
      ['Taken', formatDate(asset.localDateTime)],
      ['Updated', formatDate(asset.fileModifiedAt)],
      ['Size', formatBytes(exif?.fileSizeInByte)],
      ['Dimensions', width && height ? `${width} × ${height}` : '–'],
      asset.type === 'VIDEO' ? ['Length', formatDuration(asset.duration)] : undefined,
      camera ? ['Camera', camera] : undefined,
      exif?.lensModel ? ['Lens', exif.lensModel] : undefined,
      settings ? ['Settings', settings] : undefined,
      place ? ['Place', place] : undefined,
      exif?.description ? ['Description', exif.description] : undefined,
    ].filter((row): row is string[] => !!row),
  );
</script>

<aside
  class="absolute top-0 right-0 bottom-0 z-10 w-80 max-w-full overflow-y-auto bg-neutral-900/95 p-4 text-white shadow-2xl"
  aria-label="Info"
>
  <div class="mb-4 flex items-center justify-between">
    <h2 class="text-lg font-semibold">Info</h2>
    <button type="button" class="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onclick={onclose}>
      Hide
    </button>
  </div>
  <dl class="space-y-3 text-sm">
    {#each rows as [label, value] (label)}
      <div>
        <dt class="text-xs tracking-wide text-neutral-400 uppercase">{label}</dt>
        <dd class="break-words">{value}</dd>
      </div>
    {/each}
  </dl>
</aside>
