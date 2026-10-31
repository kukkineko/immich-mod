import { authenticate } from '$lib/utils/auth';
import { PAGE_SIZE, type FolderAsset } from '../folder-types';
import type { PageLoad } from './$types';

export const load = (async ({ url, params, fetch }) => {
  await authenticate(url);

  const name = params.name;
  const response = await fetch(`/api/view/folder-people/assets?name=${encodeURIComponent(name)}&page=0&size=${PAGE_SIZE}`);
  const assets: FolderAsset[] = response.ok ? await response.json() : [];

  return {
    name,
    assets,
    failed: !response.ok,
    meta: {
      title: name,
    },
  };
}) satisfies PageLoad;
