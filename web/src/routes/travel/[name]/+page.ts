import { appSettings } from '$lib/stores/app-settings.svelte';
import { PHOTO_PAGE, type PublicPhoto, type PublicTrip } from '../travel-types';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  await appSettings.load();
  const name = params.name;
  const [photos, trips] = await Promise.all([
    fetch(`/api/view/public/trips/photos?name=${encodeURIComponent(name)}&page=0&size=${PHOTO_PAGE}`),
    fetch('/api/view/public/trips'),
  ]);
  const trip = trips.ok ? ((await trips.json()) as PublicTrip[]).find((candidate) => candidate.name === name) : undefined;
  return {
    name,
    trip,
    photos: photos.ok ? ((await photos.json()) as PublicPhoto[]) : [],
    found: photos.ok,
  };
}) satisfies PageLoad;
