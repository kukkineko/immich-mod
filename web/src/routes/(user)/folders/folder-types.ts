export type FolderPerson = {
  key: string;
  kind: 'folder';
  name: string;
  assetCount: number;
  assetId: string | null;
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
  const params = new URLSearchParams({ name: key, page: String(page), size: String(PAGE_SIZE) });
  for (const [field, value] of Object.entries(query)) {
    if (value !== '') {
      params.set(field, value);
    }
  }
  return `/api/view/folder-people/assets?${params}`;
};

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
