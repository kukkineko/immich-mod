import { appSettings } from '$lib/stores/app-settings.svelte';
import type { PublicTripPage } from '../travel-types';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  await appSettings.load();
  const response = await fetch(`/api/view/public/trips/page?name=${encodeURIComponent(params.name)}`);
  return {
    name: params.name,
    trip: response.ok ? ((await response.json()) as PublicTripPage) : undefined,
  };
}) satisfies PageLoad;
