import { authenticate } from '$lib/utils/auth';
import type { FolderPerson, LooseGroup } from './folder-types';
import type { PageLoad } from './$types';

export const load = (async ({ url, fetch }) => {
  await authenticate(url);

  const [people, loose] = await Promise.all([fetch('/api/view/folder-people'), fetch('/api/view/folder-people/loose')]);

  return {
    people: people.ok ? ((await people.json()) as FolderPerson[]) : [],
    loose: loose.ok ? ((await loose.json()) as LooseGroup[]) : [],
    failed: !people.ok,
    meta: {
      title: 'People',
    },
  };
}) satisfies PageLoad;
