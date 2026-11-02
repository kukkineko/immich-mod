import { error } from '@sveltejs/kit';
import { authenticate } from '$lib/utils/auth';
import type { SiteTrip } from '../site-types';
import type { PageLoad } from './$types';

export const load = (async ({ url, params, fetch }) => {
  await authenticate(url);

  const response = await fetch(`/api/view/site/trip?name=${encodeURIComponent(params.name)}`);
  if (!response.ok) {
    error(response.status, 'This trip does not exist.');
  }
  return {
    trip: (await response.json()) as SiteTrip,
    meta: {
      title: 'Public page',
    },
  };
}) satisfies PageLoad;
