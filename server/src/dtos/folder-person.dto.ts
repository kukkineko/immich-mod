import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const FolderPersonFaceBoxSchema = z
  .object({
    x1: z.number().meta({ format: 'double' }).describe('Left edge as fraction of image width'),
    y1: z.number().meta({ format: 'double' }).describe('Top edge as fraction of image height'),
    x2: z.number().meta({ format: 'double' }).describe('Right edge as fraction of image width'),
    y2: z.number().meta({ format: 'double' }).describe('Bottom edge as fraction of image height'),
  })
  .meta({ id: 'FolderPersonFaceBoxDto' });

const FolderPersonSchema = z
  .object({
    key: z.string().describe('Identifier used to request the assets of this entry'),
    kind: z.enum(['folder', 'face', 'text', 'other']).describe('Where this entry comes from'),
    name: z.string().describe('Top-level folder name, or a generated label for loose media'),
    assetCount: z.number().int().describe('Number of assets in the folder, including all subfolders'),
    assetId: z.uuidv4().nullable().describe('Representative asset used for the portrait'),
    faceBox: FolderPersonFaceBoxSchema.nullable().describe('Face region to crop to, if the asset has a detected face'),
  })
  .meta({ id: 'FolderPersonDto' });

export class FolderPersonDto extends createZodDto(FolderPersonSchema) {}
