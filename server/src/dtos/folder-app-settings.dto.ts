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
  })
  .meta({ id: 'FolderAppSettingsDto' });

export class FolderAppSettingsDto extends createZodDto(FolderAppSettingsSchema) {}
