<script lang="ts">
  import FolderView from './FolderView.svelte';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<!-- a fresh view per folder, so moving into a subfolder starts with clean filters and lists -->
{#key `${data.key}:${data.subfolders.flattenSubfolders}`}
  <FolderView
    folder={data.key}
    initialAssets={data.assets}
    subfolders={data.subfolders.folders}
    flattenSubfolders={data.subfolders.flattenSubfolders}
    initialFailed={data.failed}
    initialPublic={data.isPublic}
  />
{/key}
