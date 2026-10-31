import { createZodDto } from 'nestjs-zod';
import { AssetResponseSchema } from 'src/dtos/asset-response.dto';
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
    kind: z.literal('folder').describe('Where this entry comes from'),
    name: z.string().describe('Top-level folder name, or a generated label for loose media'),
    assetCount: z.number().int().describe('Number of assets in the folder, including all subfolders'),
    assetId: z.uuidv4().nullable().describe('Representative asset used for the portrait'),
    faceBox: FolderPersonFaceBoxSchema.nullable().describe('Face region to crop to, if the asset has a detected face'),
  })
  .meta({ id: 'FolderPersonDto' });

export class FolderPersonDto extends createZodDto(FolderPersonSchema) {}

const FolderSubfolderSchema = z
  .object({
    name: z.string().describe('Subfolder name'),
    path: z.string().describe('Path relative to the library root'),
    assetCount: z.number().int().describe('Number of assets below this subfolder'),
    assetId: z.uuidv4().nullable().describe('Representative asset'),
  })
  .meta({ id: 'FolderSubfolderDto' });

export class FolderSubfolderDto extends createZodDto(FolderSubfolderSchema) {}

const FolderSubfoldersSchema = z
  .object({
    flattenSubfolders: z.boolean().describe('Whether subfolders of this top-level folder are folded into it'),
    folders: z.array(FolderSubfolderSchema).describe('Direct subfolders to show, empty when folded'),
  })
  .meta({ id: 'FolderSubfoldersDto' });

export class FolderSubfoldersDto extends createZodDto(FolderSubfoldersSchema) {}

const LooseGroupSchema = z
  .object({
    key: z.string().describe('Identifier of the group'),
    kind: z.enum(['face', 'other']).describe('Faces that belong together, or everything without a recognised face'),
    name: z.string().describe('Person name, a generated label, or Unsorted'),
    assets: z.array(AssetResponseSchema).describe('Media of the group, newest first'),
  })
  .meta({ id: 'LooseGroupDto' });

export class LooseGroupDto extends createZodDto(LooseGroupSchema) {}
