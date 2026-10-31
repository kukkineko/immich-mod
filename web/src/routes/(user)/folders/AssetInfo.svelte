<script lang="ts">
  import { formatBytes, formatDate, formatDuration, type FolderAsset } from './folder-types';

  interface Props {
    asset: FolderAsset;
  }

  let { asset }: Props = $props();

  type Face = {
    id: string;
    imageWidth: number;
    imageHeight: number;
    boundingBoxX1: number;
    boundingBoxY1: number;
    boundingBoxX2: number;
    boundingBoxY2: number;
    person: { id: string; name: string } | null;
  };

  let faces = $state<Face[]>([]);
  let words = $state<string[]>([]);
  let loaded = $state(false);

  // recognised faces and text come from the existing machine-learning jobs
  $effect(() => {
    const id = asset.id;
    loaded = false;
    faces = [];
    words = [];
    const controller = new AbortController();
    const load = async <T,>(url: string): Promise<T[]> => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        return response.ok ? ((await response.json()) as T[]) : [];
      } catch {
        return [];
      }
    };
    void Promise.all([
      load<Face>(`/api/faces?id=${id}`),
      asset.type === 'IMAGE' ? load<{ text: string }>(`/api/assets/${id}/ocr`) : Promise.resolve([]),
    ]).then(([foundFaces, foundText]) => {
      if (controller.signal.aborted) {
        return;
      }
      faces = foundFaces;
      words = [...new Set(foundText.map((entry) => entry.text.trim()).filter(Boolean))];
      loaded = true;
    });
    return () => controller.abort();
  });

  // square crop of the preview around a face, done with a scaled background image
  const faceStyle = (face: Face) => {
    const fw = (face.boundingBoxX2 - face.boundingBoxX1) / face.imageWidth;
    const fh = (face.boundingBoxY2 - face.boundingBoxY1) / face.imageHeight;
    const x = face.boundingBoxX1 / face.imageWidth;
    const y = face.boundingBoxY1 / face.imageHeight;
    return [
      `background-image: url(/api/assets/${asset.id}/thumbnail?size=preview)`,
      `background-size: ${100 / fw}% ${100 / fh}%`,
      `background-position: ${fw >= 1 ? 0 : (x / (1 - fw)) * 100}% ${fh >= 1 ? 0 : (y / (1 - fh)) * 100}%`,
    ].join(';');
  };

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
  <h2 class="mt-12 mb-4 text-lg font-semibold">Info</h2>
  <dl class="space-y-3 text-sm">
    {#each rows as [label, value] (label)}
      <div>
        <dt class="text-xs tracking-wide text-neutral-400 uppercase">{label}</dt>
        <dd class="break-words">{value}</dd>
      </div>
    {/each}
  </dl>

  <h3 class="mt-6 mb-2 text-xs tracking-wide text-neutral-400 uppercase">Recognised faces</h3>
  {#if !loaded}
    <p class="text-sm text-neutral-500">Loading…</p>
  {:else if faces.length === 0}
    <p class="text-sm text-neutral-500">No faces recognised.</p>
  {:else}
    <ul class="flex flex-wrap gap-3">
      {#each faces as face (face.id)}
        <li class="w-16 text-center">
          <div class="h-16 w-16 rounded-full bg-neutral-700 bg-no-repeat" style={faceStyle(face)}></div>
          <p class="mt-1 truncate text-xs text-neutral-300">{face.person?.name || 'Unnamed'}</p>
        </li>
      {/each}
    </ul>
  {/if}

  {#if asset.type === 'IMAGE'}
    <h3 class="mt-6 mb-2 text-xs tracking-wide text-neutral-400 uppercase">Recognised text</h3>
    {#if !loaded}
      <p class="text-sm text-neutral-500">Loading…</p>
    {:else if words.length === 0}
      <p class="text-sm text-neutral-500">No text recognised.</p>
    {:else}
      <ul class="flex flex-wrap gap-1.5">
        {#each words as word (word)}
          <li class="rounded-md bg-white/10 px-2 py-0.5 text-sm break-all">{word}</li>
        {/each}
      </ul>
    {/if}
  {/if}
</aside>
