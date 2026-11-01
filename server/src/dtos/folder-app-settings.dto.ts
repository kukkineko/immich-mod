import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const FolderAppSettingsSchema = z
  .object({
    title: z.string().trim().min(1).max(60).describe('Title shown in the header and browser tab'),
    pinMode: z
      .enum(['every-load', 'session', 'off'])
      .describe(
        'every-load: ask for the PIN on every page load. session: PIN once per login. off: normal email and password login.',
      ),
    flattenSubfolders: z
      .boolean()
      .describe('true: every subfolder is folded into its top-level folder. false: subfolders are shown as folders.'),
    mode: z
      .enum(['content', 'travel'])
      .describe(
        'content: private folder gallery for one user. travel: the same private side plus a public showcase of chosen trips.',
      ),
    pinConfigured: z
      .boolean()
      .optional()
      .describe('Read only: whether any user has set a PIN yet. Without one the PIN screen is skipped.'),
  })
  .meta({ id: 'FolderAppSettingsDto' });

const FolderCoverSchema = z
  .object({
    name: z.string().min(1).describe('Top-level folder name'),
    assetId: z.uuidv4().nullable().describe('Asset to use as the folder image, null to go back to automatic'),
  })
  .meta({ id: 'FolderCoverDto' });

export class FolderCoverDto extends createZodDto(FolderCoverSchema) {}

const FolderModeSchema = z
  .object({
    name: z.string().min(1).describe('Top-level folder name'),
    flattenSubfolders: z.boolean().describe('true: fold all subfolders into the folder. false: show them as folders.'),
  })
  .meta({ id: 'FolderModeDto' });

export class FolderModeDto extends createZodDto(FolderModeSchema) {}

const FolderPublicSchema = z
  .object({
    name: z.string().min(1).describe('Top-level folder name'),
    isPublic: z.boolean().describe('Whether the folder is shown on the public side'),
  })
  .meta({ id: 'FolderPublicDto' });

export class FolderPublicDto extends createZodDto(FolderPublicSchema) {}

export class FolderAppSettingsDto extends createZodDto(FolderAppSettingsSchema) {}
