export type FolderPerson = {
  name: string;
  assetCount: number;
  assetId: string | null;
  faceBox: { x1: number; y1: number; x2: number; y2: number } | null;
};

export type FolderAsset = {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
  originalFileName: string;
};

export const PAGE_SIZE = 200;
