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
    name: z.string().describe('Top-level folder name'),
    assetCount: z.number().int().describe('Number of assets in the folder, including all subfolders'),
    assetId: z.uuidv4().nullable().describe('Representative asset used for the portrait'),
    faceBox: FolderPersonFaceBoxSchema.nullable().describe('Face region to crop to, if the asset has a detected face'),
  })
  .meta({ id: 'FolderPersonDto' });

export class FolderPersonDto extends createZodDto(FolderPersonSchema) {}
