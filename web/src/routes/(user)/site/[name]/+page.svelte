<script lang="ts">
  import { appSettings } from '$lib/stores/app-settings.svelte';
  import FolderHeader from '../../folders/FolderHeader.svelte';
  import PhotoPicker from '../PhotoPicker.svelte';
  import {
    dayKey,
    formatDayHeading,
    newKey,
    stripKeys,
    thumbnail,
    withKeys,
    type EditorBlock,
    type SitePhoto,
  } from '../site-types';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const trip = data.trip;
  const curated = trip.curated;

  let title = $state(trip.title);
  let intro = $state(trip.intro ?? '');
  let story = $state(trip.story ?? '');
  let published = $state(trip.published);
  let folderPublic = $state(trip.folderPublic);
  let blocks = $state<EditorBlock[]>(withKeys(trip.blocks));
  let hidden = $state<SitePhoto[]>(trip.hidden);
  let photos = $state<Record<string, SitePhoto>>(
    Object.fromEntries([...trip.photos, ...trip.hidden].map((photo) => [photo.id, photo])),
  );

  let picking = $state(false);
  let saving = $state(false);
  let message = $state('');
  let dragKey = $state<string | undefined>();
  let overKey = $state<string | undefined>();

  const photoBlocks = $derived(blocks.filter((block) => block.type === 'photo'));
  const snapshot = () =>
    JSON.stringify({
      title,
      intro,
      story,
      published,
      blocks: stripKeys(blocks),
      hidden: hidden.map((photo) => photo.id),
      folderPublic,
    });
  let saved = $state(snapshot());
  const dirty = $derived(snapshot() !== saved);
  const existing = $derived(new Set(photoBlocks.map((block) => block.id!)));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= blocks.length || from === to) {
      return;
    }
    const next = [...blocks];
    next.splice(to, 0, next.splice(from, 1)[0]);
    blocks = next;
  };

  const remove = (index: number) => {
    const [block] = blocks.splice(index, 1);
    // a folder keeps its photo, it is just no longer shown; a curated trip simply lets go of it
    if (block.type === 'photo' && !curated && block.id && photos[block.id]) {
      hidden = [photos[block.id], ...hidden];
    }
  };

  const insertAfter = (index: number, type: 'heading' | 'text') => {
    blocks.splice(index + 1, 0, { key: newKey(), type, text: '' });
  };

  const publish = (photo: SitePhoto) => {
    hidden = hidden.filter((candidate) => candidate.id !== photo.id);
    blocks.push({ key: newKey(), type: 'photo', id: photo.id });
  };

  const publishAll = () => {
    for (const photo of hidden.toSorted((a, b) => a.takenAt.localeCompare(b.takenAt))) {
      blocks.push({ key: newKey(), type: 'photo', id: photo.id });
    }
    hidden = [];
  };

  const hideAll = () => {
    if (!confirm('Hide every photo from the public page? Headings and texts stay.')) {
      return;
    }
    hidden = [...photoBlocks.map((block) => photos[block.id!]), ...hidden];
    blocks = blocks.filter((block) => block.type !== 'photo');
  };

  const addPhotos = (added: SitePhoto[]) => {
    for (const photo of added) {
      photos[photo.id] = photo;
      blocks.push({ key: newKey(), type: 'photo', id: photo.id });
    }
  };

  type Arrangement = 'date-asc' | 'date-desc' | 'place' | 'group-day' | 'group-place';
  const arrange = (mode: Arrangement) => {
    const hasTexts = blocks.some((block) => block.type !== 'photo');
    if (hasTexts && !confirm('This rebuilds the layout. Headings and text blocks are removed. Continue?')) {
      return;
    }
    const taken = (block: EditorBlock) => photos[block.id!]?.takenAt ?? '';
    const byDate = photoBlocks.toSorted((a, b) => taken(a).localeCompare(taken(b)));
    const heading = (text: string): EditorBlock => ({ key: newKey(), type: 'heading', text });

    if (mode === 'date-asc') {
      blocks = byDate;
    } else if (mode === 'date-desc') {
      blocks = byDate.toReversed();
    } else if (mode === 'place') {
      const place = (block: EditorBlock) => photos[block.id!]?.place ?? '￿';
      blocks = byDate.toSorted((a, b) => place(a).localeCompare(place(b)));
    } else if (mode === 'group-day') {
      const result: EditorBlock[] = [];
      let day = '';
      for (const block of byDate) {
        if (dayKey(taken(block)) !== day) {
          day = dayKey(taken(block));
          result.push(heading(formatDayHeading(taken(block))));
        }
        result.push(block);
      }
      blocks = result;
    } else {
      // places in the order they were first visited
      const groups = new Map<string, EditorBlock[]>();
      for (const block of byDate) {
        const place = photos[block.id!]?.place ?? 'Elsewhere';
        groups.set(place, [...(groups.get(place) ?? []), block]);
      }
      blocks = [...groups].flatMap(([place, list]) => [heading(place), ...list]);
    }
  };

  const setFolderPublic = async (value: boolean) => {
    const response = await fetch('/api/view/folder-people/public', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trip.name, isPublic: value }),
    });
    if (response.ok) {
      folderPublic = value;
    }
  };

  const embedPhoto = (id: string) => {
    if (id) {
      story = `${story.trimEnd()}${story.trim() ? '\n\n' : ''}![](photo:${id})\n\n`;
    }
  };

  const save = async () => {
    saving = true;
    message = '';
    try {
      // a photo only needs a note when it differs from what its folder says
      const overrides: Record<string, boolean> = {};
      if (!curated) {
        for (const block of photoBlocks) {
          if (!folderPublic) {
            overrides[block.id!] = true;
          }
        }
        for (const photo of hidden) {
          if (folderPublic) {
            overrides[photo.id] = false;
          }
        }
      }
      const response = await fetch('/api/view/site/trip', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trip.name,
          title: !curated && title.trim() === trip.name ? '' : title,
          intro,
          story,
          published,
          blocks: stripKeys(blocks),
          overrides,
        }),
      });
      if (response.ok) {
        saved = snapshot();
        message = 'Saved.';
      } else {
        message = 'Could not save.';
      }
    } catch {
      message = 'Could not save.';
    } finally {
      saving = false;
    }
  };

  const onDragStart = (event: DragEvent, block: EditorBlock) => {
    dragKey = block.key;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', block.key);
      const card = (event.currentTarget as HTMLElement).closest('article');
      if (card) {
        event.dataTransfer.setDragImage(card, 24, 24);
      }
    }
  };

  const onDrop = (target: EditorBlock) => {
    const from = blocks.findIndex((block) => block.key === dragKey);
    const to = blocks.findIndex((block) => block.key === target.key);
    if (from !== -1 && to !== -1) {
      move(from, to);
    }
    dragKey = overKey = undefined;
  };

  const inputClass =
    'w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800';
  const buttonClass =
    'rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700';
  const tinyButton =
    'rounded-md bg-neutral-200/80 px-2 py-0.5 text-xs hover:bg-neutral-300 disabled:opacity-30 dark:bg-neutral-700 dark:hover:bg-neutral-600';
  const sectionClass =
    'space-y-3 rounded-2xl border border-neutral-200 bg-white/70 p-4 dark:border-neutral-700 dark:bg-neutral-800/50';

  const previewHref = $derived(`/travel/${encodeURIComponent(trip.name)}`);
</script>

<svelte:head>
  <title>Edit {trip.name} – {appSettings.title}</title>
</svelte:head>

<svelte:window onbeforeunload={(event) => dirty && event.preventDefault()} />

<div class="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
  <FolderHeader title="Public page: {trip.curated ? trip.title : trip.name}" backHref="/site" />

  <main class="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6">
    <section class={sectionClass}>
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="mr-auto text-lg font-semibold">Page</h2>
        {#if curated}
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={published} /> Published
          </label>
        {:else}
          <label class="flex items-center gap-2 text-sm" title="New photos in this folder follow this setting">
            <input
              type="checkbox"
              checked={folderPublic}
              onchange={(event) => setFolderPublic(event.currentTarget.checked)}
            />
            Whole folder is public
          </label>
        {/if}
        {#if !curated || published}
          <a href={previewHref} target="_blank" rel="noopener" class={buttonClass}>Open public page</a>
        {/if}
        <button type="button" class={buttonClass} disabled={saving || !dirty} onclick={save}>
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
        {#if message}<span class="text-sm text-neutral-500">{message}</span>{/if}
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <label class="block text-sm">
          <span class="mb-1 block font-medium">Title</span>
          <input class={inputClass} bind:value={title} placeholder={trip.name} />
        </label>
        <label class="block text-sm md:row-span-2">
          <span class="mb-1 block font-medium">Intro</span>
          <textarea
            class="{inputClass} h-full min-h-24"
            bind:value={intro}
            placeholder="A few lines shown at the top of the page"></textarea>
        </label>
      </div>
    </section>

    <section class={sectionClass}>
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="mr-auto text-lg font-semibold">
          Photos and texts <span class="text-sm font-normal text-neutral-500">({photoBlocks.length} shown)</span>
        </h2>
        {#if curated}
          <button type="button" class={buttonClass} onclick={() => (picking = true)}>Add photos…</button>
        {/if}
        <button
          type="button"
          class={buttonClass}
          onclick={() => blocks.push({ key: newKey(), type: 'heading', text: '' })}>Add heading</button
        >
        <button type="button" class={buttonClass} onclick={() => blocks.push({ key: newKey(), type: 'text', text: '' })}
          >Add text</button
        >
        <details class="relative">
          <summary class="{buttonClass} cursor-pointer list-none">Arrange ▾</summary>
          <div
            class="absolute right-0 z-10 mt-1 flex w-56 max-w-[calc(100vw-1.5rem)] flex-col rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
          >
            <button
              type="button"
              class="mb-1 self-end rounded-full px-3 py-1 text-lg leading-none hover:bg-neutral-100 sm:hidden dark:hover:bg-neutral-700"
              aria-label="Close menu"
              onclick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
            >
              &#10005;
            </button>
            {#each [['date-asc', 'Oldest first'], ['date-desc', 'Newest first'], ['place', 'Sort by place'], ['group-day', 'Group by day'], ['group-place', 'Group by place']] as [mode, label] (mode)}
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
                onclick={(event) => {
                  arrange(mode as Arrangement);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
              >
                {label}
              </button>
            {/each}
          </div>
        </details>
        {#if !curated}
          <button type="button" class={buttonClass} disabled={photoBlocks.length === 0} onclick={hideAll}
            >Hide all</button
          >
        {/if}
      </div>
      <p class="text-xs text-neutral-500">
        Drag a photo by its picture (or a text by its grip) to reorder, or use the arrows. Photos not listed here follow
        at the end, oldest first.
      </p>

      {#if blocks.length === 0}
        <p class="py-10 text-center text-neutral-500">
          {curated ? 'No photos yet. Use “Add photos…” to pick some.' : 'Nothing is shown on the public page.'}
        </p>
      {:else}
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {#each blocks as block, index (block.key)}
            {@const photo = block.type === 'photo' ? photos[block.id!] : undefined}
            <li class={block.type === 'photo' ? '' : 'col-span-full'}>
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <article
                class="flex h-full flex-col gap-2 rounded-xl border bg-white p-2 dark:bg-neutral-900 {overKey ===
                  block.key && dragKey !== block.key
                  ? 'border-blue-500 ring-2 ring-blue-500'
                  : 'border-neutral-200 dark:border-neutral-700'} {dragKey === block.key ? 'opacity-40' : ''}"
                ondragover={(event) => {
                  if (dragKey) {
                    event.preventDefault();
                    overKey = block.key;
                  }
                }}
                ondrop={(event) => {
                  event.preventDefault();
                  onDrop(block);
                }}
              >
                {#if block.type === 'photo'}
                  <img
                    src={thumbnail(block.id!)}
                    alt={photo?.name ?? ''}
                    draggable="true"
                    ondragstart={(event) => onDragStart(event, block)}
                    ondragend={() => (dragKey = overKey = undefined)}
                    class="aspect-[4/3] w-full cursor-grab rounded-lg object-cover"
                  />
                  <p class="truncate text-xs text-neutral-500" title={photo?.name}>
                    {photo?.place ?? photo?.name ?? ''}
                  </p>
                  <input class={inputClass} bind:value={block.caption} placeholder="Caption" />
                  <select
                    class={inputClass}
                    value={block.size ?? ''}
                    onchange={(event) =>
                      (block.size = (event.currentTarget.value || undefined) as 'wide' | 'full' | undefined)}
                  >
                    <option value="">Normal size</option>
                    <option value="wide">Wide</option>
                    <option value="full">Full width</option>
                  </select>
                {:else}
                  <div class="flex items-start gap-2">
                    <span
                      role="button"
                      tabindex="-1"
                      aria-label="Drag to reorder"
                      draggable="true"
                      ondragstart={(event) => onDragStart(event, block)}
                      ondragend={() => (dragKey = overKey = undefined)}
                      class="cursor-grab px-1 pt-1 text-neutral-400 select-none"
                    >
                      ⋮⋮
                    </span>
                    <div class="min-w-0 flex-1 space-y-1">
                      <p class="text-xs font-medium text-neutral-500 uppercase">
                        {block.type === 'heading' ? 'Heading' : 'Text'}
                      </p>
                      {#if block.type === 'heading'}
                        <input class={inputClass} bind:value={block.text} placeholder="Heading" />
                      {:else}
                        <textarea
                          class="{inputClass} min-h-24"
                          bind:value={block.text}
                          placeholder="Text between the photos"></textarea>
                      {/if}
                    </div>
                  </div>
                {/if}
                <div class="mt-auto flex flex-wrap gap-1">
                  <button
                    type="button"
                    class={tinyButton}
                    disabled={index === 0}
                    aria-label="Move earlier"
                    onclick={() => move(index, index - 1)}>↑</button
                  >
                  <button
                    type="button"
                    class={tinyButton}
                    disabled={index === blocks.length - 1}
                    aria-label="Move later"
                    onclick={() => move(index, index + 1)}>↓</button
                  >
                  <button type="button" class={tinyButton} onclick={() => insertAfter(index, 'heading')}
                    >+ heading</button
                  >
                  <button type="button" class={tinyButton} onclick={() => insertAfter(index, 'text')}>+ text</button>
                  <button type="button" class="{tinyButton} ml-auto" onclick={() => remove(index)}>
                    {block.type === 'photo' ? (curated ? 'Remove' : 'Hide') : 'Delete'}
                  </button>
                </div>
              </article>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if !curated}
      <section class={sectionClass}>
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="mr-auto text-lg font-semibold">
            Not public <span class="text-sm font-normal text-neutral-500">({hidden.length})</span>
          </h2>
          <button type="button" class={buttonClass} disabled={hidden.length === 0} onclick={publishAll}
            >Publish all</button
          >
        </div>
        {#if hidden.length === 0}
          <p class="text-sm text-neutral-500">Every photo of this folder is on the public page.</p>
        {:else}
          <ul class="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10">
            {#each hidden as photo (photo.id)}
              <li class="space-y-1">
                <img
                  src={thumbnail(photo.id)}
                  alt={photo.name}
                  loading="lazy"
                  class="aspect-square w-full rounded-lg object-cover"
                />
                <button type="button" class="{tinyButton} w-full" onclick={() => publish(photo)}>Publish</button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    <section class={sectionClass}>
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="mr-auto text-lg font-semibold">
          Story <span class="text-sm font-normal text-neutral-500">(optional separate page)</span>
        </h2>
        <select
          class="{inputClass} !w-auto max-w-xs"
          value=""
          onchange={(event) => {
            embedPhoto(event.currentTarget.value);
            event.currentTarget.value = '';
          }}
        >
          <option value="">Insert a photo…</option>
          {#each photoBlocks as block (block.key)}
            <option value={block.id}>{photos[block.id!]?.name ?? block.id}</option>
          {/each}
        </select>
      </div>
      <textarea
        class="{inputClass} min-h-64 font-mono"
        bind:value={story}
        placeholder={'# A heading\n\nParagraphs are separated by an empty line. **bold**, *italic*, [link](https://example.com)\n\n- list item\n\n> quote\n\n![caption](photo:ID)'}
      ></textarea>
      <p class="text-xs text-neutral-500">
        Leave it empty for no story page. Otherwise visitors get a “Read the story” button under the intro. Only photos
        that are public can be shown inside the story.
      </p>
    </section>
  </main>
</div>

{#if picking}
  <PhotoPicker {existing} onadd={addPhotos} onclose={() => (picking = false)} />
{/if}
