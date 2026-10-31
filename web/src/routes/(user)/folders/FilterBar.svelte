<script lang="ts">
  import { defaultQuery, type AssetQuery, type SortKey } from './folder-types';

  interface Props {
    query: AssetQuery;
  }

  let { query = $bindable() }: Props = $props();

  let filtersOpen = $state(false);

  const filtersActive = $derived(
    Object.entries(query).some(([key, value]) => !['sort', 'dir', 'typeFirst'].includes(key) && value !== ''),
  );

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'taken', label: 'Date taken' },
    { value: 'updated', label: 'Date updated' },
    { value: 'name', label: 'Name' },
    { value: 'size', label: 'File size' },
    { value: 'duration', label: 'Video length' },
  ];

  const inputClass =
    'w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800';
  const buttonClass =
    'rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700';
</script>

<section class="rounded-2xl border border-neutral-200 bg-white/70 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
  <div class="flex flex-wrap items-center gap-2">
    <input
      type="search"
      placeholder="Search by name"
      class="{inputClass} max-w-56"
      bind:value={query.q}
      aria-label="Search by name"
    />

    <label class="flex items-center gap-1 text-sm">
      Sort
      <select class={inputClass} bind:value={query.sort} aria-label="Sort by">
        {#each sortOptions as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>

    <button
      type="button"
      class={buttonClass}
      onclick={() => (query.dir = query.dir === 'desc' ? 'asc' : 'desc')}
      aria-label="Toggle sort direction"
    >
      {query.dir === 'desc' ? '↓ Descending' : '↑ Ascending'}
    </button>

    <label class="flex items-center gap-1 text-sm">
      Show
      <select class={inputClass} bind:value={query.typeFirst} aria-label="Media order">
        <option value="any">Images and videos mixed</option>
        <option value="image">Images first</option>
        <option value="video">Videos first</option>
      </select>
    </label>

    <button type="button" class={buttonClass} onclick={() => (filtersOpen = !filtersOpen)} aria-expanded={filtersOpen}>
      Filters{filtersActive ? ' •' : ''}
    </button>

    {#if filtersActive || query.q}
      <button type="button" class="text-sm underline" onclick={() => (query = defaultQuery())}>Reset</button>
    {/if}
  </div>

  {#if filtersOpen}
    <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <fieldset class="space-y-1">
        <legend class="text-xs text-neutral-500 uppercase">Date taken</legend>
        <input type="date" class={inputClass} bind:value={query.takenFrom} aria-label="Taken from" />
        <input type="date" class={inputClass} bind:value={query.takenTo} aria-label="Taken until" />
      </fieldset>
      <fieldset class="space-y-1">
        <legend class="text-xs text-neutral-500 uppercase">Date updated</legend>
        <input type="date" class={inputClass} bind:value={query.updatedFrom} aria-label="Updated from" />
        <input type="date" class={inputClass} bind:value={query.updatedTo} aria-label="Updated until" />
      </fieldset>
      <fieldset class="space-y-1">
        <legend class="text-xs text-neutral-500 uppercase">File size (MB)</legend>
        <input type="number" min="0" step="any" placeholder="min" class={inputClass} bind:value={query.minSizeMb} />
        <input type="number" min="0" step="any" placeholder="max" class={inputClass} bind:value={query.maxSizeMb} />
      </fieldset>
      <fieldset class="space-y-1">
        <legend class="text-xs text-neutral-500 uppercase">Video length (seconds)</legend>
        <input type="number" min="0" step="any" placeholder="min" class={inputClass} bind:value={query.minSeconds} />
        <input type="number" min="0" step="any" placeholder="max" class={inputClass} bind:value={query.maxSeconds} />
      </fieldset>
    </div>
  {/if}
</section>
