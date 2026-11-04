import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Next,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NextFunction, Response } from 'express';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AssetResponseDto } from 'src/dtos/asset-response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { FolderAppSettingsDto, FolderCoverDto, FolderModeDto, FolderPublicDto } from 'src/dtos/folder-app-settings.dto';
import { FolderPersonDto, FolderTreeEntryDto, FolderSubfoldersDto, LooseGroupDto, PublicTripDto } from 'src/dtos/folder-person.dto';
import {
  PublicTripPageDto,
  SiteCuratedCreateDto,
  SiteTripDto,
  SiteTripNameDto,
  SiteTripSaveDto,
  SiteTripSummaryDto,
} from 'src/dtos/public-site.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated, FileResponse } from 'src/middleware/auth.guard';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { ViewService } from 'src/services/view.service';
import { sendFile } from 'src/utils/file';
import { parseFolderAssetFilter } from 'src/utils/folder-people';

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

  @Get('public/trips/page')
  @Authenticated({ public: true })
  @Endpoint({
    summary: 'Retrieve a public trip page',
    description: 'Title, texts, layout and photos of a public trip. Only available in travel mode.',
    history: new HistoryBuilder().added('v2'),
  })
  getPublicTripPage(@Query('name') name = ''): Promise<PublicTripPageDto> {
    return this.service.getPublicTripPage(name);
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

  @Get('resized/:id/:size')
  @FileResponse()
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Retrieve a medium-sized photo',
    description: 'A 640 or 1280 pixel wide WebP copy of a photo, made on first request and cached.',
    history: new HistoryBuilder().added('v2'),
  })
  async getResizedFile(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Param('size') size: string,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    await sendFile(res, next, () => this.service.getResizedFileFor(auth, id, size), this.logger);
  }

  @Get('site/curated')
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'List curated trips',
    description: 'Curated trips take photos from any folder. Only used in travel mode.',
    history: new HistoryBuilder().added('v2'),
  })
  getCuratedTrips(): Promise<SiteTripSummaryDto[]> {
    return this.service.getCuratedTrips();
  }

  @Post('site/curated')
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Create a curated trip',
    description: 'Starts an empty, unpublished curated trip.',
    history: new HistoryBuilder().added('v2'),
  })
  createCuratedTrip(@Body() dto: SiteCuratedCreateDto): Promise<SiteTripNameDto> {
    return this.service.createCuratedTrip(dto);
  }

  @Delete('site/curated')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Delete a curated trip',
    description: 'Removes the trip page. The photos stay where they are.',
    history: new HistoryBuilder().added('v2'),
  })
  deleteCuratedTrip(@Query('name') name = ''): Promise<void> {
    return this.service.deleteCuratedTrip(name);
  }

  @Get('site/trip')
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Retrieve a trip for editing',
    description: 'Layout, texts, visible photos and hidden photos of a folder trip or curated trip.',
    history: new HistoryBuilder().added('v2'),
  })
  getSiteTrip(@Auth() auth: AuthDto, @Query('name') name = ''): Promise<SiteTripDto> {
    return this.service.getSiteTrip(auth, name);
  }

  @Put('site/trip')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Save a trip',
    description: 'Stores layout, texts and per-photo visibility of a folder trip or curated trip.',
    history: new HistoryBuilder().added('v2'),
  })
  saveSiteTrip(@Body() dto: SiteTripSaveDto): Promise<void> {
    return this.service.saveSiteTrip(dto);
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
      query.deep === 'true',
    );
  }

  @Get('folder-people/tree')
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Retrieve folder tree',
    description: 'Retrieve every folder at any depth with the number of images below it.',
    history: new HistoryBuilder().added('v2'),
  })
  getFolderTree(): Promise<FolderTreeEntryDto[]> {
    return this.service.getFolderTree();
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
