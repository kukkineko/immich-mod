import { authenticate } from '$lib/utils/auth';
import type { FolderPerson } from '../folders/folder-types';
import type { PageLoad } from './$types';
import type { CuratedSummary } from './site-types';

export const load = (async ({ url, fetch }) => {
  await authenticate(url);

  const [curated, people] = await Promise.all([fetch('/api/view/site/curated'), fetch('/api/view/folder-people')]);
  return {
    curated: curated.ok ? ((await curated.json()) as CuratedSummary[]) : [],
    people: people.ok ? ((await people.json()) as FolderPerson[]) : [],
    meta: {
      title: 'Public site',
    },
  };
}) satisfies PageLoad;
