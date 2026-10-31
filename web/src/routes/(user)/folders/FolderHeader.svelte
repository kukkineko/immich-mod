<script lang="ts">
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { Route } from '$lib/route';

  interface Props {
    title: string;
    backHref?: string;
  }

  let { title, backHref }: Props = $props();

  const linkClass =
    'rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700';
</script>

<header
  class="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/90 px-4 py-3 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/90"
>
  {#if backHref}
    <a href={backHref} class={linkClass} aria-label="Back">&larr; Back</a>
  {/if}
  <h1 class="min-w-0 flex-1 truncate text-xl font-semibold">{title}</h1>
  <nav class="flex items-center gap-1">
    <a href={Route.userSettings()} class="{linkClass} bg-primary text-light hover:bg-primary/90">Settings</a>
    {#if authManager.user.isAdmin}
      <a href={Route.systemSettings()} class={linkClass}>Admin</a>
    {/if}
    <a href={Route.logout()} class={linkClass}>Log out</a>
  </nav>
</header>
