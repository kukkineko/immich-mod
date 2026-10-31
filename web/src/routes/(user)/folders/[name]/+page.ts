import { authenticate } from '$lib/utils/auth';
import { assetsUrl, defaultQuery, type FolderAsset } from '../folder-types';
import type { PageLoad } from './$types';

export const load = (async ({ url, params, fetch }) => {
  await authenticate(url);

  const key = params.name;
  const response = await fetch(assetsUrl(key, defaultQuery(), 0));
  const assets: FolderAsset[] = response.ok ? await response.json() : [];

  return {
    key,
    assets,
    failed: !response.ok,
  };
}) satisfies PageLoad;
