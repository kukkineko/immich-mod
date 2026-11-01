export type PublicTrip = { name: string; photoCount: number; assetId: string | null };

export type PublicPhoto = {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  takenAt: string;
  place: string | null;
  camera: string | null;
  settings: string | null;
};

export const publicFile = (id: string, size: 'thumbnail' | 'preview' | 'original') =>
  `/api/view/public/file/${id}/${size}`;

export const photoRatio = (photo: PublicPhoto) =>
  Math.min(2.4, Math.max(0.5, photo.width && photo.height ? photo.width / photo.height : 1.5));

export const PHOTO_PAGE = 200;

export const formatDay = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
