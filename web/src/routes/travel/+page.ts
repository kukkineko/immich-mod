import { appSettings } from '$lib/stores/app-settings.svelte';
import type { PublicTrip } from './travel-types';
import type { PageLoad } from './$types';

export const load = (async ({ fetch }) => {
  await appSettings.load();
  const response = await fetch('/api/view/public/trips');
  return {
    trips: response.ok ? ((await response.json()) as PublicTrip[]) : [],
    available: response.ok,
  };
}) satisfies PageLoad;
