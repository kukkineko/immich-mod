import type { FolderAsset } from '../folders/folder-types';

export type SitePhoto = {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  takenAt: string;
  place: string | null;
  camera: string | null;
  settings: string | null;
};

export type SiteBlock = {
  type: 'photo' | 'heading' | 'text';
  id?: string;
  size?: 'wide' | 'full';
  caption?: string;
  text?: string;
};

export type SiteTrip = {
  name: string;
  title: string;
  intro: string | null;
  story: string | null;
  assetId: string | null;
  photos: SitePhoto[];
  blocks: SiteBlock[];
  hidden: SitePhoto[];
  curated: boolean;
  published: boolean;
  folderPublic: boolean;
};

export type CuratedSummary = {
  name: string;
  title: string;
  published: boolean;
  photoCount: number;
  assetId: string | null;
};

/** a block as the editor holds it: the key keeps lists stable while blocks move */
export type EditorBlock = SiteBlock & { key: string };

let counter = 0;
export const newKey = () => `b${++counter}`;

export const withKeys = (blocks: SiteBlock[]): EditorBlock[] => blocks.map((block) => ({ ...block, key: newKey() }));

export const stripKeys = (blocks: EditorBlock[]): SiteBlock[] =>
  blocks.map(({ key: _key, ...block }) => ({
    ...block,
    // fields that do not belong to the block type are dropped by the server too
    ...(block.type === 'photo' ? {} : { id: undefined, size: undefined, caption: undefined }),
  }));

export const thumbnail = (id: string) => `/api/assets/${id}/thumbnail?size=thumbnail`;

/** a private folder asset as the metadata a trip page needs */
export const toSitePhoto = (asset: FolderAsset): SitePhoto => {
  const exif = asset.exifInfo;
  const details = [
    exif?.fNumber ? `ƒ/${exif.fNumber}` : undefined,
    exif?.exposureTime ? `${exif.exposureTime}s` : undefined,
    exif?.focalLength ? `${exif.focalLength} mm` : undefined,
    exif?.iso ? `ISO ${exif.iso}` : undefined,
  ].filter(Boolean);
  return {
    id: asset.id,
    name: asset.originalFileName,
    width: exif?.exifImageWidth ?? asset.width,
    height: exif?.exifImageHeight ?? asset.height,
    takenAt: new Date(asset.localDateTime).toISOString(),
    place: [exif?.city, exif?.country].filter(Boolean).join(', ') || null,
    camera: [exif?.make, exif?.model].filter(Boolean).join(' ') || null,
    settings: details.length > 0 ? details.join('  ·  ') : null,
  };
};

export const formatDayHeading = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

/** UTC date key, so a photo taken at 23:50 local time stays on its own day */
export const dayKey = (value: string) => value.slice(0, 10);
