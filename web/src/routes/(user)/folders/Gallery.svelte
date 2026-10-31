<script lang="ts">
  import MediaTile from './MediaTile.svelte';
  import type { FolderAsset } from './folder-types';

  interface Props {
    assets: FolderAsset[];
    onopen: (index: number) => void;
    onfavorite: (asset: FolderAsset) => void;
  }

  let { assets, onopen, onfavorite }: Props = $props();
</script>

<!-- justified rows: every tile keeps its own aspect ratio, rows fill the width, gaps are identical everywhere -->
<ul class="flex flex-wrap gap-2 [--row-h:150px] sm:gap-3 sm:[--row-h:220px] lg:[--row-h:260px]">
  {#each assets as asset, index (asset.id)}
    <MediaTile {asset} onopen={() => onopen(index)} onfavorite={() => onfavorite(asset)} />
  {/each}
  <!-- keeps the last row from stretching across the whole width -->
  <li class="h-0 grow-[10]" aria-hidden="true"></li>
</ul>
