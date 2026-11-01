export type FolderPerson = {
  key: string;
  kind: 'folder';
  name: string;
  assetCount: number;
  assetId: string | null;
  isPublic: boolean;
  faceBox: { x1: number; y1: number; x2: number; y2: number } | null;
};

export type FolderAsset = {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
  originalFileName: string;
  originalPath: string;
  localDateTime: string;
  fileCreatedAt: string;
  fileModifiedAt: string;
  isFavorite: boolean;
  duration: number | null;
  width: number | null;
  height: number | null;
  exifInfo?: {
    fileSizeInByte?: number | null;
    exifImageWidth?: number | null;
    exifImageHeight?: number | null;
    make?: string | null;
    model?: string | null;
    lensModel?: string | null;
    fNumber?: number | null;
    exposureTime?: string | null;
    iso?: number | null;
    focalLength?: number | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    description?: string | null;
  } | null;
};

export type FolderSubfolder = {
  name: string;
  path: string;
  assetCount: number;
  assetId: string | null;
};

export type FolderSubfolders = { flattenSubfolders: boolean; folders: FolderSubfolder[] };

export type LooseGroup = {
  key: string;
  kind: 'face' | 'other';
  name: string;
  assets: FolderAsset[];
};

export const PAGE_SIZE = 200;

export type SortKey = 'taken' | 'updated' | 'name' | 'size' | 'duration';

export type AssetQuery = {
  q: string;
  sort: SortKey;
  dir: 'asc' | 'desc';
  typeFirst: 'any' | 'image' | 'video';
  takenFrom: string;
  takenTo: string;
  updatedFrom: string;
  updatedTo: string;
  minSizeMb: string;
  maxSizeMb: string;
  minSeconds: string;
  maxSeconds: string;
};

export const defaultQuery = (): AssetQuery => ({
  q: '',
  sort: 'taken',
  dir: 'desc',
  typeFirst: 'any',
  takenFrom: '',
  takenTo: '',
  updatedFrom: '',
  updatedTo: '',
  minSizeMb: '',
  maxSizeMb: '',
  minSeconds: '',
  maxSeconds: '',
});

export const assetsUrl = (key: string, query: AssetQuery, page: number) => {
  const params = queryParams(query);
  params.set('name', key);
  params.set('page', String(page));
  params.set('size', String(PAGE_SIZE));
  return `/api/view/folder-people/assets?${params}`;
};

const queryParams = (query: AssetQuery) => {
  const params = new URLSearchParams();
  for (const [field, value] of Object.entries(query)) {
    if (value !== '') {
      params.set(field, value);
    }
  }
  return params;
};

export const looseUrl = (query: AssetQuery) => `/api/view/folder-people/loose?${queryParams(query)}`;

/** width / height of the media, kept within a sane range so one odd file cannot wreck a row */
export const aspectRatio = (asset: FolderAsset) => {
  const width = asset.exifInfo?.exifImageWidth || asset.width;
  const height = asset.exifInfo?.exifImageHeight || asset.height;
  const ratio = width && height ? width / height : asset.type === 'VIDEO' ? 9 / 16 : 4 / 3;
  return Math.min(2.2, Math.max(0.5, ratio));
};

/** stars or un-stars an asset; resolves to false (and leaves the asset untouched) when the server refuses */
export const setFavorite = async (asset: FolderAsset, isFavorite: boolean) => {
  try {
    const response = await fetch(`/api/assets/${asset.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite }),
    });
    if (response.ok) {
      asset.isFavorite = isFavorite;
    }
    return response.ok;
  } catch {
    return false;
  }
};

/** favourites first, everything else keeps its order */
export const favouritesFirst = <T extends { isFavorite: boolean }>(list: T[]) => [
  ...list.filter((item) => item.isFavorite),
  ...list.filter((item) => !item.isFavorite),
];

/** where to look for a picture of an asset: the big preview, then the small thumbnail, then (images only) the file itself */
export const pictureSources = (id: string, isImage = true) => [
  `/api/assets/${id}/thumbnail?size=preview`,
  `/api/assets/${id}/thumbnail?size=thumbnail`,
  ...(isImage ? [`/api/assets/${id}/original`] : []),
];

export const formatBytes = (bytes?: number | null) => {
  if (!bytes) {
    return '–';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

export const formatDuration = (milliseconds?: number | null) => {
  if (milliseconds === null || milliseconds === undefined) {
    return '–';
  }
  const total = Math.round(milliseconds / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

export const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString() : '–');
