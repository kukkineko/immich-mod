export type PublicTrip = {
  name: string;
  title: string;
  intro: string | null;
  curated: boolean;
  hasStory: boolean;
  photoCount: number;
  assetId: string | null;
};

export type PublicPhoto = {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  takenAt: string;
  place: string | null;
  camera: string | null;
  settings: string | null;
  caption?: string;
};

export type PublicBlock = {
  type: 'photo' | 'heading' | 'text';
  id?: string;
  size?: 'wide' | 'full';
  caption?: string;
  text?: string;
};

export type PublicTripPage = {
  name: string;
  title: string;
  intro: string | null;
  story: string | null;
  assetId: string | null;
  photos: PublicPhoto[];
  blocks: PublicBlock[];
};

export const publicFile = (id: string, size: 'thumbnail' | 'preview') =>
  `/api/view/public/file/${id}/${size}`;

export const photoRatio = (photo: PublicPhoto) =>
  Math.min(2.4, Math.max(0.5, photo.width && photo.height ? photo.width / photo.height : 1.5));

export const formatDay = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

/** one unit of the page: a justified row group of normal photos, or a single block */
export type Section =
  | { kind: 'photos'; items: { photo: PublicPhoto; caption?: string }[] }
  | { kind: 'single'; photo: PublicPhoto; size: 'wide' | 'full'; caption?: string }
  | { kind: 'heading'; text: string }
  | { kind: 'text'; paragraphs: string[] };

/** consecutive normal photos share justified rows; wide and full photos, headings and texts break the flow */
export const buildSections = (page: PublicTripPage): Section[] => {
  const byId = new Map(page.photos.map((photo) => [photo.id, photo]));
  const sections: Section[] = [];
  for (const block of page.blocks) {
    if (block.type === 'heading' && block.text) {
      sections.push({ kind: 'heading', text: block.text });
    } else if (block.type === 'text' && block.text) {
      sections.push({
        kind: 'text',
        paragraphs: block.text
          .split(/\n{2,}/)
          .map((part) => part.trim())
          .filter(Boolean),
      });
    } else if (block.type === 'photo' && block.id && byId.has(block.id)) {
      const photo = byId.get(block.id)!;
      if (block.size) {
        sections.push({ kind: 'single', photo, size: block.size, caption: block.caption });
        continue;
      }
      const last = sections.at(-1);
      if (last?.kind === 'photos') {
        last.items.push({ photo, caption: block.caption });
      } else {
        sections.push({ kind: 'photos', items: [{ photo, caption: block.caption }] });
      }
    }
  }
  return sections;
};
