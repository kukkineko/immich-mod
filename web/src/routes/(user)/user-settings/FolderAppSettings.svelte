<script lang="ts">
  import { appSettings, type PinMode } from '$lib/stores/app-settings.svelte';
  import { Alert, Button, Field, Input, Stack } from '@immich/ui';

  let title = $state(appSettings.title);
  let pinMode = $state<PinMode>(appSettings.pinMode);
  let saving = $state(false);
  let message = $state<{ ok: boolean; text: string } | undefined>();

  const modes: { value: PinMode; label: string; help: string }[] = [
    {
      value: 'every-load',
      label: 'PIN on every load',
      help: 'The PIN is asked again after every reload (F5) and in every new tab.',
    },
    {
      value: 'session',
      label: 'PIN once',
      help: 'Log in with the PIN once; reloads stay logged in until the session ends.',
    },
    {
      value: 'off',
      label: 'No PIN',
      help: 'Normal one-time email and password login. PIN login is switched off on the server.',
    },
  ];

  const save = async () => {
    saving = true;
    message = undefined;
    try {
      const response = await fetch('/api/view/app-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, pinMode }),
      });
      if (!response.ok) {
        message = { ok: false, text: 'Could not save the settings.' };
        return;
      }
      appSettings.apply(await response.json());
      message = { ok: true, text: 'Saved.' };
    } catch {
      message = { ok: false, text: 'Could not reach the server.' };
    } finally {
      saving = false;
    }
  };
</script>

<form
  class="flex flex-col gap-6"
  onsubmit={(event) => {
    event.preventDefault();
    void save();
  }}
>
  <Stack gap={4}>
    <Field label="Title" description="Shown in the header and the browser tab.">
      <Input bind:value={title} maxlength={60} required />
    </Field>

    <fieldset class="flex flex-col gap-3">
      <legend class="mb-1 font-medium">How strict is login?</legend>
      {#each modes as mode (mode.value)}
        <label class="flex cursor-pointer items-start gap-3">
          <input type="radio" name="pin-mode" value={mode.value} bind:group={pinMode} class="mt-1" />
          <span>
            <span class="block font-medium">{mode.label}</span>
            <span class="block text-sm text-gray-500">{mode.help}</span>
          </span>
        </label>
      {/each}
    </fieldset>

    {#if pinMode !== 'off'}
      <p class="text-sm text-gray-500">The PIN itself is set in the PIN code section further down this page.</p>
    {/if}

    {#if message}
      <Alert color={message.ok ? 'success' : 'danger'} title={message.text} closable />
    {/if}

    <div class="flex justify-end">
      <Button type="submit" shape="round" loading={saving}>Save</Button>
    </div>
  </Stack>
</form>
