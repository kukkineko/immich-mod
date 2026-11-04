/**
 * Loads pictures the way a person looks at a page: only what is near the screen, the small version first, and the
 * sharper version only once every small one that is wanted has arrived. Scrolling away drops requests that have not
 * finished, and what was seen before comes straight out of the browser cache (the server marks files cacheable).
 */

export type ProgressiveOptions = {
  /** small, fast picture shown first */
  low: string;
  /** sharper picture swapped in later; leave out to stay at the small one */
  high?: string;
  /** the small picture could not be loaded; set new options to try another source */
  onfail?: () => void;
};

type Entry = {
  img: HTMLImageElement;
  options: ProgressiveOptions;
  /** 0: nothing shown, 1: small one shown, 2: sharp one shown */
  stage: 0 | 1 | 2;
  near: boolean;
  visible: boolean;
  /** order in which the picture came near; later is more likely what the user is looking at now */
  seq: number;
  loader?: HTMLImageElement;
};

const MAX_LOW = 6;
const MAX_HIGH = 2;
/** start loading this far outside the screen, so small pictures are ready before they scroll in */
const NEAR_MARGIN = '400px';

const entries = new Map<Element, Entry>();
let counter = 0;
let nearObserver: IntersectionObserver | undefined;
let visibleObserver: IntersectionObserver | undefined;

const cancel = (entry: Entry) => {
  if (entry.loader) {
    // an empty source aborts the request that is still running
    entry.loader.onload = null;
    entry.loader.onerror = null;
    entry.loader.src = '';
    entry.loader = undefined;
  }
};

const start = (entry: Entry, url: string, stage: 1 | 2) => {
  const loader = new Image();
  entry.loader = loader;
  loader.onload = () => {
    entry.loader = undefined;
    entry.img.src = url;
    entry.stage = stage;
    pump();
  };
  loader.onerror = () => {
    entry.loader = undefined;
    // keep what is shown; a failed sharp version is not retried, a failed small one is left empty
    entry.stage = stage;
    if (stage === 1) {
      entry.options.onfail?.();
    }
    pump();
  };
  loader.src = url;
};

const pump = () => {
  const all = [...entries.values()];
  const lowActive = all.filter((entry) => entry.loader && entry.stage === 0).length;
  const highActive = all.filter((entry) => entry.loader && entry.stage === 1).length;
  // what is on screen first, then whatever came near last
  const byPriority = (a: Entry, b: Entry) => Number(b.visible) - Number(a.visible) || b.seq - a.seq;

  const lows = all.filter((entry) => entry.stage === 0 && entry.near && !entry.loader).toSorted(byPriority);
  for (const entry of lows.slice(0, Math.max(0, MAX_LOW - lowActive))) {
    start(entry, entry.options.low, 1);
  }

  // sharp pictures wait until no small one is waiting or on its way
  if (lows.length > 0 || lowActive > 0) {
    return;
  }
  const highs = all
    .filter((entry) => entry.stage === 1 && !!entry.options.high && entry.visible && !entry.loader)
    .toSorted(byPriority);
  for (const entry of highs.slice(0, Math.max(0, MAX_HIGH - highActive))) {
    start(entry, entry.options.high!, 2);
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
        } else if (entry.stage === 0) {
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
      if (!entry.visible && entry.stage === 1) {
        cancel(entry);
      }
    }
    pump();
  });
  return { near: nearObserver, visible: visibleObserver };
};

/** Svelte action for an `<img>`: `use:progressive={{ low, high }}`. */
export const progressive = (img: HTMLImageElement, options: ProgressiveOptions) => {
  const watch = observers();
  const entry: Entry = { img, options, stage: 0, near: false, visible: false, seq: 0 };
  entries.set(img, entry);
  watch.near.observe(img);
  watch.visible.observe(img);

  return {
    update(next: ProgressiveOptions) {
      if (next.low === entry.options.low && next.high === entry.options.high) {
        entry.options = next;
        return;
      }
      cancel(entry);
      entry.options = next;
      entry.stage = 0;
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
