import { authenticate } from '$lib/utils/auth';
import type { FolderPerson } from './folder-types';
import type { PageLoad } from './$types';

export const load = (async ({ url, fetch }) => {
  await authenticate(url);

  const response = await fetch('/api/view/folder-people');
  const people: FolderPerson[] = response.ok ? await response.json() : [];

  return {
    people,
    failed: !response.ok,
    meta: {
      title: 'People',
    },
  };
}) satisfies PageLoad;
