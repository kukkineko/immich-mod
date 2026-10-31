export type LooseAsset = { id: string; type: string; localDateTime: Date };
export type LooseFace = {
  assetId: string;
  personGroupId: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
};

export type LooseGroup = {
  key: string;
  kind: 'face' | 'other';
  name: string;
  assetIds: string[];
  portraitAssetId: string | null;
  faceBox: { x1: number; y1: number; x2: number; y2: number } | null;
};

const faceArea = (face: LooseFace) => Math.max(0, face.x2 - face.x1) * Math.max(0, face.y2 - face.y1);

/**
 * Groups media that sits directly in the library root by detected face cluster.
 * Whatever has no recognised face is collected into one "Unsorted" group.
 */
export const groupLooseAssets = (
  assets: LooseAsset[],
  faces: LooseFace[],
  groupNames: Map<string, string>,
): LooseGroup[] => {
  const groups: LooseGroup[] = [];
  const assigned = new Set<string>();
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  // 1. face clusters: each asset joins the cluster of its largest face
  const facesByAsset = new Map<string, LooseFace>();
  for (const face of faces) {
    if (!face.personGroupId || !byId.has(face.assetId)) {
      continue;
    }
    const current = facesByAsset.get(face.assetId);
    if (!current || faceArea(face) > faceArea(current)) {
      facesByAsset.set(face.assetId, face);
    }
  }

  const byCluster = new Map<string, LooseFace[]>();
  for (const face of facesByAsset.values()) {
    const list = byCluster.get(face.personGroupId!) ?? [];
    list.push(face);
    byCluster.set(face.personGroupId!, list);
  }

  const clusters = [...byCluster.entries()].toSorted((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [index, [clusterId, members]] of clusters.entries()) {
    const best = members.filter((member) => member.width > 0 && member.height > 0).toSorted((a, b) => faceArea(b) - faceArea(a))[0] ?? members[0];
    for (const member of members) {
      assigned.add(member.assetId);
    }
    groups.push({
      key: `loose:face:${clusterId}`,
      kind: 'face',
      name: groupNames.get(clusterId) || `Person ${index + 1}`,
      assetIds: members.map((member) => member.assetId),
      portraitAssetId: best.assetId,
      faceBox:
        best.width > 0 && best.height > 0
          ? { x1: best.x1 / best.width, y1: best.y1 / best.height, x2: best.x2 / best.width, y2: best.y2 / best.height }
          : null,
    });
  }

  // everything without a recognised face
  const rest = assets.filter((asset) => !assigned.has(asset.id));
  if (rest.length > 0) {
    groups.push({
      key: 'loose:other',
      kind: 'other',
      name: 'Unsorted',
      assetIds: rest.map((asset) => asset.id),
      portraitAssetId: (rest.find((asset) => asset.type === 'IMAGE') ?? rest[0]).id,
      faceBox: null,
    });
  }

  return groups;
};

export type FolderAssetSort = 'taken' | 'updated' | 'name' | 'size' | 'duration';

export type FolderAssetFilter = {
  q?: string;
  takenFrom?: Date;
  takenTo?: Date; // exclusive
  updatedFrom?: Date;
  updatedTo?: Date; // exclusive
  minSize?: number; // bytes
  maxSize?: number;
  minDuration?: number; // milliseconds
  maxDuration?: number;
  sort: FolderAssetSort;
  dir: 'asc' | 'desc';
  typeFirst: 'any' | 'image' | 'video';
};

const parseDate = (value?: string, endOfRange = false) => {
  if (!value) {
    return;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return;
  }
  // a bare date means the whole day, so an upper bound moves to the start of the next day
  if (endOfRange && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
};

const parseNumber = (value: string | undefined, factor: number) => {
  if (value === undefined || value === '') {
    return;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * factor) : undefined;
};

export const parseFolderAssetFilter = (query: Record<string, string | undefined>): FolderAssetFilter => {
  const sorts: FolderAssetSort[] = ['taken', 'updated', 'name', 'size', 'duration'];
  return {
    q: query.q?.trim() || undefined,
    takenFrom: parseDate(query.takenFrom),
    takenTo: parseDate(query.takenTo, true),
    updatedFrom: parseDate(query.updatedFrom),
    updatedTo: parseDate(query.updatedTo, true),
    minSize: parseNumber(query.minSizeMb, 1024 * 1024),
    maxSize: parseNumber(query.maxSizeMb, 1024 * 1024),
    minDuration: parseNumber(query.minSeconds, 1000),
    maxDuration: parseNumber(query.maxSeconds, 1000),
    sort: sorts.includes(query.sort as FolderAssetSort) ? (query.sort as FolderAssetSort) : 'taken',
    dir: query.dir === 'asc' ? 'asc' : 'desc',
    typeFirst: query.typeFirst === 'image' || query.typeFirst === 'video' ? query.typeFirst : 'any',
  };
};
