/**
 * Loads pictures the way a person looks at a page, and spends as little bandwidth as it can:
 *  - only what is near the screen is loaded at all, and requests that have not finished are dropped on scrolling away
 *  - every picture starts with the smallest version and grows in steps (small, medium, large)
 *  - a step above the first is only fetched for pictures that stayed on screen for a moment, one after another, and only
 *    once no first step is waiting
 *  - the ladder stops at the size the picture is actually shown at (screen density included), and at less on
 *    data-saver or slow connections
 * What was seen before comes straight from the browser cache (the server marks files cacheable).
 */

export type Step = {
  url: string;
  /** width in pixels of this version */
  width: number;
};

export type ProgressiveOptions = {
  /** versions in ascending size; the first is shown as soon as the picture comes near the screen */
  steps: Step[];
  /** the first version could not be loaded; set new options to try another source */
  onfail?: () => void;
};

type Entry = {
  img: HTMLImageElement;
  options: ProgressiveOptions;
  /** how many steps are shown already */
  done: number;
  /** how many steps this picture is going to be taken to, known once it is time for the second one */
  target?: number;
  near: boolean;
  visible: boolean;
  /** order in which the picture came near; later is more likely what the user is looking at now */
  seq: number;
  /** since when the picture has been on screen */
  visibleSince: number;
  loader?: HTMLImageElement;
};

const MAX_FIRST = 6;
const MAX_LATER = 2;
/** start loading this far outside the screen, so small pictures are ready before they scroll in */
const NEAR_MARGIN = '400px';
/** a picture must stay this long on screen before it is sharpened, so scrolling past costs nothing */
const DWELL_MS = 350;

const entries = new Map<Element, Entry>();
let counter = 0;
let nearObserver: IntersectionObserver | undefined;
let visibleObserver: IntersectionObserver | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

type Connection = { saveData?: boolean; effectiveType?: string };
const connection = () => (navigator as Navigator & { connection?: Connection }).connection;

/** how many steps of the ladder this picture is worth, given its size on screen and the connection */
const targetFor = (entry: Entry) => {
  const { steps } = entry.options;
  const shown = (entry.img.clientWidth || window.innerWidth) * (window.devicePixelRatio || 1);
  let count = steps.findIndex((step) => step.width >= shown) + 1;
  if (count === 0) {
    count = steps.length;
  }
  const link = connection();
  if (link?.saveData || link?.effectiveType === '2g' || link?.effectiveType === 'slow-2g') {
    count = Math.min(count, 2);
  } else if (link?.effectiveType === '3g') {
    count = Math.min(count, 3);
  }
  return Math.max(1, count);
};

const cancel = (entry: Entry) => {
  if (entry.loader) {
    // an empty source aborts the request that is still running
    entry.loader.onload = null;
    entry.loader.onerror = null;
    entry.loader.src = '';
    entry.loader = undefined;
  }
};

const start = (entry: Entry) => {
  const index = entry.done;
  const { url } = entry.options.steps[index];
  const loader = new Image();
  entry.loader = loader;
  loader.onload = () => {
    entry.loader = undefined;
    entry.img.src = url;
    entry.done = index + 1;
    pump();
  };
  loader.onerror = () => {
    entry.loader = undefined;
    if (index === 0) {
      entry.options.onfail?.();
    }
    // a failed larger step is not retried; what is shown stays
    entry.target = entry.done;
    entry.done = Math.max(entry.done, index + 1);
    pump();
  };
  loader.src = url;
};

const pump = () => {
  if (document.hidden) {
    return;
  }
  const all = [...entries.values()];
  const firstActive = all.filter((entry) => entry.loader && entry.done === 0).length;
  const laterActive = all.filter((entry) => entry.loader && entry.done > 0).length;
  // what is on screen first, then whatever came near last
  const byPriority = (a: Entry, b: Entry) => Number(b.visible) - Number(a.visible) || b.seq - a.seq;

  const firsts = all.filter((entry) => entry.done === 0 && entry.near && !entry.loader).toSorted(byPriority);
  for (const entry of firsts.slice(0, Math.max(0, MAX_FIRST - firstActive))) {
    start(entry);
  }

  // larger versions wait until no first version is waiting or on its way
  if (firsts.length > 0 || firstActive > 0) {
    return;
  }
  const now = Date.now();
  const later = all
    .filter((entry) => {
      if (entry.done === 0 || entry.loader || !entry.visible) {
        return false;
      }
      entry.target ??= targetFor(entry);
      return entry.done < Math.min(entry.target, entry.options.steps.length);
    })
    .toSorted(byPriority);
  let started = 0;
  let wait = Number.POSITIVE_INFINITY;
  for (const entry of later) {
    const ready = entry.visibleSince + DWELL_MS - now;
    if (ready > 0) {
      wait = Math.min(wait, ready);
    } else if (started + laterActive < MAX_LATER) {
      start(entry);
      started++;
    }
  }
  if (Number.isFinite(wait)) {
    clearTimeout(timer);
    timer = setTimeout(pump, wait + 10);
  }
};

const observers = () => {
  nearObserver ??= new IntersectionObserver(
    (changes) => {
      for (const change of changes) {
        const entry = entries.get(change.target);
        if (!entry) {
          continue;
        }
        entry.near = change.isIntersecting;
        if (entry.near) {
          entry.seq = ++counter;
        } else if (entry.done === 0) {
          cancel(entry);
        }
      }
      pump();
    },
    { rootMargin: NEAR_MARGIN },
  );
  visibleObserver ??= new IntersectionObserver((changes) => {
    for (const change of changes) {
      const entry = entries.get(change.target);
      if (!entry) {
        continue;
      }
      entry.visible = change.isIntersecting;
      if (entry.visible) {
        entry.visibleSince = Date.now();
      } else if (entry.done > 0) {
        cancel(entry);
      }
    }
    pump();
  });
  return { near: nearObserver, visible: visibleObserver };
};

if (typeof document !== 'undefined') {
  // nothing is fetched for a tab nobody is looking at; it carries on when the tab comes back
  document.addEventListener('visibilitychange', pump);
}

/** Svelte action for an `<img>`: `use:progressive={{ steps }}`. */
export const progressive = (img: HTMLImageElement, options: ProgressiveOptions) => {
  const watch = observers();
  const entry: Entry = { img, options, done: 0, near: false, visible: false, seq: 0, visibleSince: 0 };
  entries.set(img, entry);
  watch.near.observe(img);
  watch.visible.observe(img);

  return {
    update(next: ProgressiveOptions) {
      const same =
        next.steps.length === entry.options.steps.length &&
        next.steps.every((step, index) => step.url === entry.options.steps[index].url);
      entry.options = next;
      if (same) {
        return;
      }
      cancel(entry);
      entry.done = 0;
      entry.target = undefined;
      img.removeAttribute('src');
      pump();
    },
    destroy() {
      cancel(entry);
      entries.delete(img);
      watch.near.unobserve(img);
      watch.visible.unobserve(img);
      pump();
    },
  };
};

/** The usual ladder for a picture the server can resize: thumbnail, 640 wide, 1280 wide, then the full preview. */
export const ladder = (url: (size: 'thumbnail' | 'w640' | 'w1280' | 'preview') => string): Step[] => [
  { url: url('thumbnail'), width: 250 },
  { url: url('w640'), width: 640 },
  { url: url('w1280'), width: 1280 },
  { url: url('preview'), width: 1440 },
];
