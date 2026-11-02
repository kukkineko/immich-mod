import { createZodDto } from 'nestjs-zod';
import { PublicPhotoSchema } from 'src/dtos/folder-person.dto';
import z from 'zod';

const PublicBlockSchema = z
  .object({
    type: z.enum(['photo', 'heading', 'text']).describe('What the block shows'),
    id: z.uuidv4().optional().describe('Photo blocks: asset id'),
    size: z.enum(['wide', 'full']).optional().describe('Photo blocks: span more than a normal row slot'),
    caption: z.string().max(1000).optional().describe('Photo blocks: caption under the photo'),
    text: z.string().max(20_000).optional().describe('Heading and text blocks: the text'),
  })
  .meta({ id: 'PublicBlockDto' });

const PublicTripPageSchema = z
  .object({
    name: z.string().describe('Folder name, or the id of a curated trip'),
    title: z.string(),
    intro: z.string().nullable(),
    story: z.string().nullable().describe('Long story as light markdown, null when there is none'),
    assetId: z.uuidv4().nullable().describe('Cover photo'),
    photos: z.array(PublicPhotoSchema).describe('Every visible photo, in page order'),
    blocks: z.array(PublicBlockSchema).describe('Page layout in order'),
  })
  .meta({ id: 'PublicTripPageDto' });

export class PublicTripPageDto extends createZodDto(PublicTripPageSchema) {}

const SiteTripSchema = PublicTripPageSchema.extend({
  curated: z.boolean(),
  published: z.boolean().describe('Curated trips only: shown on the public side'),
  folderPublic: z.boolean().describe('Folder trips only: whether the folder itself is public'),
  hidden: z.array(PublicPhotoSchema).describe('Folder trips only: photos that are currently not public'),
}).meta({ id: 'SiteTripDto' });

export class SiteTripDto extends createZodDto(SiteTripSchema) {}

const SiteTripSaveSchema = z
  .object({
    name: z.string().min(1),
    title: z.string().max(200).optional(),
    intro: z.string().max(5000).optional(),
    story: z.string().max(100_000).optional(),
    published: z.boolean().optional(),
    blocks: z.array(PublicBlockSchema).max(5000),
    overrides: z.record(z.uuidv4(), z.boolean()).optional().describe('Folder trips: per-photo public flag'),
  })
  .meta({ id: 'SiteTripSaveDto' });

export class SiteTripSaveDto extends createZodDto(SiteTripSaveSchema) {}

const SiteTripSummarySchema = z
  .object({
    name: z.string(),
    title: z.string(),
    curated: z.boolean(),
    published: z.boolean(),
    photoCount: z.number().int(),
    assetId: z.uuidv4().nullable(),
  })
  .meta({ id: 'SiteTripSummaryDto' });

export class SiteTripSummaryDto extends createZodDto(SiteTripSummarySchema) {}

const SiteCuratedCreateSchema = z.object({ title: z.string().min(1).max(200) }).meta({ id: 'SiteCuratedCreateDto' });

export class SiteCuratedCreateDto extends createZodDto(SiteCuratedCreateSchema) {}

const SiteTripNameSchema = z.object({ name: z.string().min(1) }).meta({ id: 'SiteTripNameDto' });

export class SiteTripNameDto extends createZodDto(SiteTripNameSchema) {}
