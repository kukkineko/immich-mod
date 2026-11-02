import { PublicSiteBlock, PublicSiteTrip } from 'src/types';

/** Curated trips share one namespace with folder names; the prefix keeps them apart. */
export const CURATED_PREFIX = '~';

export const isCuratedName = (name: string) => name.startsWith(CURATED_PREFIX);

/** A folder trip is visible when its photo has an explicit choice, otherwise it follows the folder. */
export const isPhotoVisible = (trip: PublicSiteTrip | undefined, folderPublic: boolean, id: string) =>
  trip?.overrides?.[id] ?? folderPublic;

/** Photo ids that a curated trip lists, in order. */
export const curatedPhotoIds = (trip: PublicSiteTrip | undefined) =>
  (trip?.blocks ?? []).flatMap((block) => (block.type === 'photo' && block.id ? [block.id] : []));

/**
 * Turns the saved layout plus the photos that may be shown into the layout that is shown: unknown, hidden and doubled
 * photos are dropped, text and headings stay, and visible photos the layout does not mention yet follow at the end.
 */
export const resolveBlocks = (
  saved: PublicSiteBlock[] | undefined,
  visible: { id: string; takenAt: Date | string }[],
): PublicSiteBlock[] => {
  const known = new Set(visible.map((photo) => photo.id));
  const placed = new Set<string>();
  const result: PublicSiteBlock[] = [];

  for (const block of saved ?? []) {
    if (block.type !== 'photo') {
      result.push(block);
    } else if (block.id && known.has(block.id) && !placed.has(block.id)) {
      placed.add(block.id);
      result.push(block);
    }
  }

  const rest = visible
    .filter((photo) => !placed.has(photo.id))
    .toSorted((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime());
  for (const photo of rest) {
    result.push({ type: 'photo', id: photo.id });
  }
  return result;
};

/** Drops fields a block type does not use and empty text, so a saved layout stays small and predictable. */
export const cleanBlocks = (blocks: PublicSiteBlock[]): PublicSiteBlock[] => {
  const result: PublicSiteBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'photo') {
      if (!block.id) {
        continue;
      }
      result.push({
        type: 'photo',
        id: block.id,
        ...(block.size ? { size: block.size } : {}),
        ...(block.caption?.trim() ? { caption: block.caption.trim() } : {}),
      });
    } else if (block.text?.trim()) {
      result.push({ type: block.type, text: block.text.trim() });
    }
  }
  return result;
};
