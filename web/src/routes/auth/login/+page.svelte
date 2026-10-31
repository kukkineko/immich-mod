<script lang="ts">
  import { goto } from '$app/navigation';
  import AuthPageLayout from '$lib/components/layouts/AuthPageLayout.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { pinGate } from '$lib/stores/pin-gate.svelte';
  import { getServerErrorMessage } from '$lib/utils/handle-error';
  import type { LoginResponseDto } from '@immich/sdk';
  import { Alert, Button, Field, PasswordInput, Stack } from '@immich/ui';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let pinCode = $state('');
  let errorMessage = $state('');
  let loading = $state(false);

  const onsubmit = async (event: Event) => {
    event.preventDefault();
    errorMessage = '';
    loading = true;
    try {
      const response = await fetch('/api/auth/pin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinCode }),
      });
      if (!response.ok) {
        errorMessage =
          response.status === 429
            ? 'Too many attempts. Try again in a few minutes.'
            : getServerErrorMessage(await response.json().catch(() => undefined)) || 'Incorrect PIN';
        pinCode = '';
        return;
      }
      const user: LoginResponseDto = await response.json();
      pinGate.unlocked = true;
      await goto(data.continueUrl, { invalidateAll: true });
      eventManager.emit('AuthLogin', user);
    } catch {
      errorMessage = 'Unable to reach the server';
    } finally {
      loading = false;
    }
  };
</script>

<AuthPageLayout title={data.meta.title}>
  <Stack gap={4}>
    <form {onsubmit} class="flex flex-col gap-4">
      {#if errorMessage}
        <Alert color="danger" title={errorMessage} closable />
      {/if}

      <Field label="PIN" required="indicator">
        <PasswordInput
          id="pin"
          bind:value={pinCode}
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength={6}
          autofocus
        />
      </Field>

      <Button type="submit" size="large" shape="round" fullWidth {loading} disabled={pinCode.length < 4} class="mt-4">
        Unlock
      </Button>
    </form>

    <a href="/auth/password-login" class="text-center text-sm text-gray-500 underline">Use email and password</a>
  </Stack>
</AuthPageLayout>
