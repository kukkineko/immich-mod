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
export type LooseOcr = { assetId: string; text: string };

export type LooseGroup = {
  key: string;
  kind: 'face' | 'text' | 'other';
  name: string;
  assetIds: string[];
  portraitAssetId: string | null;
  faceBox: { x1: number; y1: number; x2: number; y2: number } | null;
};

const MIN_TEXT_SIMILARITY = 0.35;
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'you', 'are', 'not', 'this', 'that', 'von', 'und', 'der', 'die', 'das']);

const faceArea = (face: LooseFace) => Math.max(0, face.x2 - face.x1) * Math.max(0, face.y2 - face.y1);

export const tokenize = (text: string): Set<string> => {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  return new Set(tokens);
};

/** Overlap coefficient, so a short caption inside a long screenshot still matches. */
export const similarity = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) {
      shared++;
    }
  }
  return shared / Math.min(a.size, b.size);
};

/**
 * Groups media that sits directly in the library root: first by detected face cluster,
 * then the remaining by similar OCR text, and whatever is left into one "Unsorted" group.
 */
export const groupLooseAssets = (
  assets: LooseAsset[],
  faces: LooseFace[],
  groupNames: Map<string, string>,
  ocr: LooseOcr[],
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

  // 2. similar OCR text among the rest (union-find over pairwise similarity)
  const textByAsset = new Map<string, string[]>();
  for (const row of ocr) {
    if (assigned.has(row.assetId) || !byId.has(row.assetId)) {
      continue;
    }
    textByAsset.set(row.assetId, [...(textByAsset.get(row.assetId) ?? []), row.text]);
  }
  const tokens = new Map<string, Set<string>>();
  for (const [assetId, parts] of textByAsset) {
    const set = tokenize(parts.join(' '));
    if (set.size >= 2) {
      tokens.set(assetId, set);
    }
  }

  const ids = [...tokens.keys()].toSorted();
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    parent.set(id, root);
    return root;
  };
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (similarity(tokens.get(ids[i])!, tokens.get(ids[j])!) >= MIN_TEXT_SIMILARITY) {
        parent.set(find(ids[j]), find(ids[i]));
      }
    }
  }

  const textGroups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    textGroups.set(root, [...(textGroups.get(root) ?? []), id]);
  }
  for (const [root, members] of [...textGroups.entries()].toSorted((a, b) => b[1].length - a[1].length)) {
    if (members.length < 2) {
      continue;
    }
    const counts = new Map<string, number>();
    for (const id of members) {
      for (const token of tokens.get(id)!) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }
    const label = [...counts.entries()]
      .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 2)
      .map(([token]) => token)
      .join(' ');
    for (const id of members) {
      assigned.add(id);
    }
    groups.push({
      key: `loose:text:${root}`,
      kind: 'text',
      name: `Text: ${label}`,
      assetIds: members,
      portraitAssetId: members.find((id) => byId.get(id)?.type === 'IMAGE') ?? members[0],
      faceBox: null,
    });
  }

  // 3. everything else
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
