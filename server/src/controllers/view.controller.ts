import { Body, Controller, Get, HttpCode, HttpStatus, Next, Param, Put, Query, Res } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AssetResponseDto } from 'src/dtos/asset-response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { FolderAppSettingsDto, FolderCoverDto, FolderModeDto, FolderPublicDto } from 'src/dtos/folder-app-settings.dto';
import { FolderPersonDto, FolderSubfoldersDto, LooseGroupDto, PublicPhotoDto, PublicTripDto } from 'src/dtos/folder-person.dto';
import { parseFolderAssetFilter } from 'src/utils/folder-people';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated, FileResponse } from 'src/middleware/auth.guard';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { sendFile } from 'src/utils/file';
import { ViewService } from 'src/services/view.service';

@ApiTags(ApiTag.Views)
@Controller('view')
export class ViewController {
  constructor(
    private service: ViewService,
    private logger: LoggingRepository,
  ) {}

  @Get('app-settings')
  @Authenticated({ public: true })
  @Endpoint({
    summary: 'Retrieve folder app settings',
    description: 'Retrieve the instance title and PIN mode. Public so the login page can adapt.',
    history: new HistoryBuilder().added('v2'),
  })
  getAppSettings(): Promise<FolderAppSettingsDto> {
    return this.service.getAppSettings();
  }

  @Put('app-settings')
  @Authenticated({ admin: true })
  @Endpoint({
    summary: 'Update folder app settings',
    description: 'Change the instance title and how strict PIN login is.',
    history: new HistoryBuilder().added('v2'),
  })
  updateAppSettings(@Body() dto: FolderAppSettingsDto): Promise<FolderAppSettingsDto> {
    return this.service.updateAppSettings(dto);
  }

  @Get('folder-people')
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Retrieve folder people',
    description: 'Retrieve each top-level folder as a person with a representative portrait asset.',
    history: new HistoryBuilder().added('v2'),
  })
  getFolderPeople(@Auth() auth: AuthDto): Promise<FolderPersonDto[]> {
    return this.service.getFolderPeople(auth);
  }

  @Get('folder-people/loose')
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Retrieve loose media',
    description:
      'Retrieve media that sits directly in the library root, grouped by recognised face with the rest as Unsorted.',
    history: new HistoryBuilder().added('v2'),
  })
  getLooseMedia(@Auth() auth: AuthDto, @Query() query: Record<string, string | undefined>): Promise<LooseGroupDto[]> {
    return this.service.getLooseMedia(auth, parseFolderAssetFilter(query));
  }

  @Put('folder-people/cover')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Set folder image',
    description: 'Choose which asset is shown as the image of a top-level folder, or reset it with a null asset.',
    history: new HistoryBuilder().added('v2'),
  })
  setFolderCover(@Auth() auth: AuthDto, @Body() dto: FolderCoverDto): Promise<void> {
    return this.service.setFolderCover(auth, dto);
  }

  @Put('folder-people/public')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Show a folder on the public side',
    description: 'Mark a top-level folder as public or private. Only used in travel mode.',
    history: new HistoryBuilder().added('v2'),
  })
  setFolderPublic(@Body() dto: FolderPublicDto): Promise<void> {
    return this.service.setFolderPublic(dto);
  }

  @Get('public/trips')
  @Authenticated({ public: true })
  @Endpoint({
    summary: 'Retrieve public trips',
    description: 'Public folders with their cover photo. Only available in travel mode.',
    history: new HistoryBuilder().added('v2'),
  })
  getPublicTrips(): Promise<PublicTripDto[]> {
    return this.service.getPublicTrips();
  }

  @Get('public/trips/photos')
  @Authenticated({ public: true })
  @Endpoint({
    summary: 'Retrieve public photos of a trip',
    description: 'Photos of a public folder, oldest first. Only available in travel mode.',
    history: new HistoryBuilder().added('v2'),
  })
  getPublicTripPhotos(@Query() query: Record<string, string | undefined>): Promise<PublicPhotoDto[]> {
    return this.service.getPublicTripPhotos(
      query.name ?? '',
      Math.max(0, Number.parseInt(query.page ?? '0', 10) || 0),
      Math.min(500, Math.max(1, Number.parseInt(query.size ?? '200', 10) || 200)),
    );
  }

  @Get('public/file/:id/:size')
  @FileResponse()
  @Authenticated({ public: true })
  @Endpoint({
    summary: 'Retrieve a public photo file',
    description: 'Thumbnail, preview or original of a photo in a public folder. Only available in travel mode.',
    history: new HistoryBuilder().added('v2'),
  })
  async getPublicFile(
    @Param('id') id: string,
    @Param('size') size: string,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    await sendFile(res, next, () => this.service.getPublicFile(id, size), this.logger);
  }

  @Put('folder-people/mode')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Set subfolder mode',
    description: 'Choose per top-level folder whether its subfolders are folded into it or shown as folders.',
    history: new HistoryBuilder().added('v2'),
  })
  setFolderMode(@Auth() auth: AuthDto, @Body() dto: FolderModeDto): Promise<void> {
    return this.service.setFolderMode(auth, dto);
  }

  @Get('folder-people/subfolders')
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Retrieve subfolders',
    description: 'Retrieve the direct subfolders of a folder when subfolders are not folded into the main folder.',
    history: new HistoryBuilder().added('v2'),
  })
  getSubfolders(@Auth() auth: AuthDto, @Query('path') path: string): Promise<FolderSubfoldersDto> {
    return this.service.getSubfolders(auth, path ?? '');
  }

  @Get('folder-people/assets')
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Retrieve folder person assets',
    description: 'Retrieve all assets of a top-level folder, including every subfolder, newest first.',
    history: new HistoryBuilder().added('v2'),
  })
  getAssetsByFolderPerson(
    @Auth() auth: AuthDto,
    @Query() query: Record<string, string | undefined>,
  ): Promise<AssetResponseDto[]> {
    const { name, page, size } = query;
    return this.service.getAssetsByFolderPerson(
      auth,
      name ?? '',
      parseFolderAssetFilter(query),
      Math.max(0, Number.parseInt(page ?? '0', 10) || 0),
      Math.min(500, Math.max(1, Number.parseInt(size ?? '200', 10) || 200)),
    );
  }

  @Get('folder/unique-paths')
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Retrieve unique paths',
    description: 'Retrieve a list of unique folder paths from asset original paths.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  getUniqueOriginalPaths(@Auth() auth: AuthDto): Promise<string[]> {
    return this.service.getUniqueOriginalPaths(auth);
  }

  @Get('folder')
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Retrieve assets by original path',
    description: 'Retrieve assets that are children of a specific folder.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  getAssetsByOriginalPath(@Auth() auth: AuthDto, @Query('path') path: string): Promise<AssetResponseDto[]> {
    return this.service.getAssetsByOriginalPath(auth, path);
  }
}
