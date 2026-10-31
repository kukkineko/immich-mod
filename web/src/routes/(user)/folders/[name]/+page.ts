import { authenticate } from '$lib/utils/auth';
import { assetsUrl, defaultQuery, type FolderAsset, type FolderSubfolders } from '../folder-types';
import type { PageLoad } from './$types';

export const load = (async ({ url, params, fetch }) => {
  await authenticate(url);

  // subfolders are addressed as /folders/<top>?sub=<a/b>
  const sub = url.searchParams.get('sub');
  const key = sub ? `${params.name}/${sub}` : params.name;
  const [response, subfolderResponse] = await Promise.all([
    fetch(assetsUrl(key, defaultQuery(), 0)),
    fetch(`/api/view/folder-people/subfolders?path=${encodeURIComponent(key)}`),
  ]);

  return {
    key,
    assets: response.ok ? ((await response.json()) as FolderAsset[]) : [],
    subfolders: subfolderResponse.ok
      ? ((await subfolderResponse.json()) as FolderSubfolders)
      : { flattenSubfolders: true, folders: [] },
    failed: !response.ok,
  };
}) satisfies PageLoad;
