import { getPublicConfig } from '@immich/sdk';
import { redirect } from '@sveltejs/kit';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { appSettings } from '$lib/stores/app-settings.svelte';
import { pinGate } from '$lib/stores/pin-gate.svelte';
import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';
import { Route } from '$lib/route';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ parent, url }) => {
  await parent();

  const continueUrl = Route.continue(url.searchParams.get('continue'), Route.photos());

  await appSettings.load();

  if (appSettings.pinMode === 'off' || !appSettings.pinConfigured) {
    redirect(307, `/auth/password-login${url.search}`);
  }

  if (authManager.authenticated && (appSettings.pinMode !== 'every-load' || !appSettings.pinConfigured || pinGate.unlocked)) {
    redirect(307, continueUrl);
  }

  if (!serverConfigManager.value.isInitialized) {
    // Admin not registered
    redirect(307, Route.register());
  }

  const publicConfig = await getPublicConfig();

  const $t = await getFormatter();
  return {
    meta: {
      title: $t('login'),
    },
    continueUrl,
    publicConfig,
  };
}) satisfies PageLoad;
