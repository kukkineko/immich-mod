import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { AssetResponseDto, mapAsset } from 'src/dtos/asset-response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { FolderAppSettingsDto, FolderCoverDto, FolderModeDto, FolderPublicDto } from 'src/dtos/folder-app-settings.dto';
import {
  FolderPersonDto,
  FolderSubfoldersDto,
  LooseGroupDto,
  PublicPhotoDto,
  PublicTripDto,
} from 'src/dtos/folder-person.dto';
import {
  PublicTripPageDto,
  SiteCuratedCreateDto,
  SiteTripDto,
  SiteTripNameDto,
  SiteTripSaveDto,
  SiteTripSummaryDto,
} from 'src/dtos/public-site.dto';
import { OnEvent } from 'src/decorators';
import { CacheControl, ImmichWorker, JobName, Permission, SystemMetadataKey } from 'src/enum';
import { StorageCore } from 'src/cores/storage.core';
import { ViewRepository } from 'src/repositories/view-repository';
import { BaseService } from 'src/services/base.service';
import { PublicSiteTrip } from 'src/types';
import { ImmichFileResponse } from 'src/utils/file';
import { FolderAssetFilter, groupLooseAssets, parseFolderAssetFilter } from 'src/utils/folder-people';
import { mimeTypes } from 'src/utils/mime-types';
import {
  CURATED_PREFIX,
  cleanBlocks,
  curatedPhotoIds,
  isCuratedName,
  isPhotoVisible,
  resolveBlocks,
} from 'src/utils/public-site';

/** Medium sizes between the thumbnail and the preview; they save bandwidth on small screens and slow links. */
const RESIZE_WIDTHS: Record<string, number> = { w640: 640, w1280: 1280 };

/** Top-level folders below this path are treated as people. Set IMMICH_FOLDER_ROOT to change it. */
const contentRoot = () => (process.env.IMMICH_FOLDER_ROOT || '/media').replaceAll(/\/+$/g, '');
/** Travel mode can read from its own root, so one development stack can hold both libraries. */
const travelRoot = () =>
  (process.env.IMMICH_TRAVEL_ROOT || process.env.IMMICH_FOLDER_ROOT || '/media').replaceAll(/\/+$/g, '');

@Injectable()
export class ViewService extends BaseService {
  getUniqueOriginalPaths(auth: AuthDto): Promise<string[]> {
    return this.viewRepository.getUniqueOriginalPaths(auth.user.id);
  }

  async getAppSettings(): Promise<FolderAppSettingsDto> {
    const stored = await this.systemMetadataRepository.get(SystemMetadataKey.FolderAppSettings);
    return {
      title: stored?.title || 'People',
      pinMode: stored?.pinMode ?? 'every-load',
      flattenSubfolders: stored?.flattenSubfolders ?? true,
      mode: stored?.mode ?? 'content',
      pinConfigured: (await this.userRepository.getAllWithPinCode()).length > 0,
    };
  }

  private async getFolderRoot() {
    return (await this.getAppSettings()).mode === 'travel' ? travelRoot() : contentRoot();
  }

  /** Videos are streamed encoded, so the live encoder is switched on once; after that the admin decides. */
  @OnEvent({ name: 'AppBootstrap', workers: [ImmichWorker.Api] })
  async onBootstrap() {
    try {
      const stored = await this.systemMetadataRepository.get(SystemMetadataKey.FolderAppSettings);
      if (stored?.encodedStreamingSet) {
        return;
      }
      const config = await this.getConfig({ withCache: false });
      if (!config.ffmpeg.realtime.enabled) {
        config.ffmpeg.realtime.enabled = true;
        await this.updateConfig(config);
      }
      await this.systemMetadataRepository.set(SystemMetadataKey.FolderAppSettings, {
        ...stored,
        encodedStreamingSet: true,
      });
    } catch (error) {
      this.logger.warn(`Could not switch on real-time video encoding: ${error}`);
    }
  }

  async updateAppSettings(dto: FolderAppSettingsDto): Promise<FolderAppSettingsDto> {
    const stored = await this.systemMetadataRepository.get(SystemMetadataKey.FolderAppSettings);
    await this.systemMetadataRepository.set(SystemMetadataKey.FolderAppSettings, {
      ...stored,
      title: dto.title,
      pinMode: dto.pinMode,
      flattenSubfolders: dto.flattenSubfolders,
      mode: dto.mode,
    });
    return this.getAppSettings();
  }

  async setFolderCover(auth: AuthDto, dto: FolderCoverDto): Promise<void> {
    const covers = { ...(await this.systemMetadataRepository.get(SystemMetadataKey.FolderCovers)) };
    if (dto.assetId) {
      covers[dto.name] = dto.assetId;
    } else {
      delete covers[dto.name];
    }
    await this.systemMetadataRepository.set(SystemMetadataKey.FolderCovers, covers);
  }

  /** a folder follows the global default unless it has its own choice */
  private async isFlattened(top: string) {
    const modes = (await this.systemMetadataRepository.get(SystemMetadataKey.FolderModes)) ?? {};
    return modes[top] ?? (await this.getAppSettings()).flattenSubfolders;
  }

  async setFolderMode(auth: AuthDto, dto: FolderModeDto): Promise<void> {
    const modes = { ...(await this.systemMetadataRepository.get(SystemMetadataKey.FolderModes)) };
    modes[dto.name] = dto.flattenSubfolders;
    await this.systemMetadataRepository.set(SystemMetadataKey.FolderModes, modes);
  }

  /**
   * A top-level folder either folds everything below it into one list, or shows its direct subfolders as folders.
   * Inside such a subfolder everything below it is folded.
   */
  async getSubfolders(auth: AuthDto, path: string): Promise<FolderSubfoldersDto> {
    if (!this.isSafePath(path)) {
      return { flattenSubfolders: true, folders: [] };
    }
    const parts = path.split('/');
    const flattenSubfolders = await this.isFlattened(parts[0]);
    if (flattenSubfolders || parts.length > 1) {
      return { flattenSubfolders, folders: [] };
    }
    const rows = await this.viewRepository.getSubfolders(auth.user.id, await this.getFolderRoot(), path);
    return {
      flattenSubfolders,
      folders: rows.map((row) => ({
        name: row.name,
        path: `${path}/${row.name}`,
        assetCount: row.count,
        assetId: row.assetId,
      })),
    };
  }

  private isSafePath(path: string) {
    return !!path && !path.startsWith('/') && !path.split('/').some((part) => ['', '.', '..'].includes(part));
  }

  async setFolderPublic(dto: FolderPublicDto): Promise<void> {
    const flags = { ...(await this.systemMetadataRepository.get(SystemMetadataKey.FolderPublic)) };
    if (dto.isPublic) {
      flags[dto.name] = true;
    } else {
      delete flags[dto.name];
    }
    await this.systemMetadataRepository.set(SystemMetadataKey.FolderPublic, flags);
  }

  async getFolderPeople(auth: AuthDto): Promise<FolderPersonDto[]> {
    return this.buildFolderPeople(auth.user.id, false);
  }

  private async buildFolderPeople(userId: string, imagesOnly: boolean): Promise<FolderPersonDto[]> {
    const { counts, faces, fallbacks } = await this.viewRepository.getFolderPeople(
      userId,
      await this.getFolderRoot(),
      imagesOnly,
    );
    const publicFlags = (await this.systemMetadataRepository.get(SystemMetadataKey.FolderPublic)) ?? {};
    const covers = (await this.systemMetadataRepository.get(SystemMetadataKey.FolderCovers)) ?? {};
    const faceByFolder = new Map(faces.map((face) => [face.folder, face]));
    const fallbackByFolder = new Map(fallbacks.map((row) => [row.folder, row.assetId]));

    const folders: FolderPersonDto[] = counts.map(({ folder, count }) => {
      const cover = covers[folder];
      const face = cover ? undefined : faceByFolder.get(folder);
      return {
        key: folder,
        kind: 'folder' as const,
        name: folder,
        isPublic: !!publicFlags[folder],
        assetCount: count,
        assetId: cover ?? face?.assetId ?? fallbackByFolder.get(folder) ?? null,
        faceBox: face
          ? { x1: face.x1 / face.width, y1: face.y1 / face.height, x2: face.x2 / face.width, y2: face.y2 / face.height }
          : null,
      };
    });

    return folders;
  }

  async getLooseMedia(auth: AuthDto, filter: FolderAssetFilter): Promise<LooseGroupDto[]> {
    const groups = await this.getLooseGroups(auth);
    if (groups.length === 0) {
      return [];
    }
    const rows = await this.viewRepository.getAssetsByIds(
      auth.user.id,
      groups.flatMap((group) => group.assetIds),
      filter,
      2000,
      0,
    );
    // rows come back in the requested order; each group keeps that order
    const order = new Map(rows.map((row, index) => [row.id, index]));
    const byId = new Map(rows.map((row) => [row.id, mapAsset(row, { auth })]));
    return groups
      .map((group) => ({
        key: group.key,
        kind: group.kind,
        name: group.name,
        assets: group.assetIds
          .filter((id) => byId.has(id))
          .toSorted((a, b) => order.get(a)! - order.get(b)!)
          .map((id) => byId.get(id)!),
      }))
      .filter((group) => group.assets.length > 0);
  }

  private async getLooseGroups(auth: AuthDto) {
    const assets = await this.viewRepository.getLooseAssets(auth.user.id, await this.getFolderRoot());
    if (assets.length === 0) {
      return [];
    }
    const ids = assets.map((asset) => asset.id);
    const faces = await this.viewRepository.getLooseFaces(ids);
    const groupIds = [...new Set(faces.map((face) => face.personGroupId).filter((id): id is string => !!id))];
    const names = await this.viewRepository.getPersonGroupNames(auth.user.id, groupIds);

    return groupLooseAssets(assets, faces, new Map(names.map((row) => [row.personGroupId, row.name])));
  }

  /** All folders at every depth, each counting the images below it, for picking photos into a curated trip. */
  async getFolderTree(): Promise<{ path: string; count: number }[]> {
    const ownerId = (await this.userRepository.getAdmin())?.id;
    if (!ownerId) {
      return [];
    }
    const totals = new Map<string, number>();
    for (const { path, count } of await this.viewRepository.getFolderTree(ownerId, await this.getFolderRoot())) {
      const parts = path.split('/');
      for (let depth = 1; depth <= parts.length; depth++) {
        const key = parts.slice(0, depth).join('/');
        totals.set(key, (totals.get(key) ?? 0) + count);
      }
    }
    return [...totals.entries()]
      .map(([path, count]) => ({ path, count }))
      .toSorted((a, b) => a.path.localeCompare(b.path));
  }

  async getAssetsByFolderPerson(
    auth: AuthDto,
    name: string,
    filter: FolderAssetFilter,
    page: number,
    size: number,
    deep = false,
  ): Promise<AssetResponseDto[]> {
    if (!this.isSafePath(name)) {
      return [];
    }
    const parts = name.split('/');
    const flattenSubfolders = deep || parts.length > 1 || (await this.isFlattened(parts[0]));
    const assets = await this.viewRepository.getAssetsByFolderPerson(
      auth.user.id,
      await this.getFolderRoot(),
      name,
      flattenSubfolders,
      filter,
      size,
      page * size,
    );
    this.repairVideos(assets);
    const encoded = await this.viewRepository.getEncodedVideoIds(
      assets.filter((asset) => asset.type === 'VIDEO').map((asset) => asset.id),
    );
    // the extra flag lets the page prefer the stored encoded copy and mark it
    return assets.map((asset) => ({ ...mapAsset(asset, { auth }), encodedVideo: encoded.has(asset.id) }));
  }

  private repaired = new Set<string>();

  /**
   * A video without a duration never went through metadata extraction, and then it has no thumbnail either.
   * Queue both once per start, so the tiles fill in by themselves instead of staying blank.
   */
  private repairVideos(assets: { id: string; type: string; duration: number | null }[]) {
    const broken = assets.filter(
      (asset) => asset.type === 'VIDEO' && asset.duration === null && !this.repaired.has(asset.id),
    );
    if (broken.length === 0) {
      return;
    }
    for (const asset of broken) {
      this.repaired.add(asset.id);
    }
    this.logger.log(`Queueing metadata and thumbnails for ${broken.length} video(s) without a duration`);
    void this.jobRepository
      .queueAll(
        broken.flatMap((asset) => [
          { name: JobName.AssetExtractMetadata, data: { id: asset.id } } as const,
          { name: JobName.AssetGenerateThumbnails, data: { id: asset.id } } as const,
        ]),
      )
      .catch((error) => this.logger.warn(`Could not queue video repair: ${error}`));
  }

  /** The public side only exists in travel mode and only ever shows what was marked public. */
  private async requireTravel() {
    if ((await this.getAppSettings()).mode !== 'travel') {
      throw new NotFoundException();
    }
    const admin = await this.userRepository.getAdmin();
    if (!admin) {
      throw new NotFoundException();
    }
    return admin.id;
  }

  private async getSite() {
    return (await this.systemMetadataRepository.get(SystemMetadataKey.PublicSite)) ?? {};
  }

  private async getFolderFlags() {
    return (await this.systemMetadataRepository.get(SystemMetadataKey.FolderPublic)) ?? {};
  }

  private toPublicPhoto(row: Awaited<ReturnType<ViewRepository['getImagesByIds']>>[number]): PublicPhotoDto {
    const exif = row.exifInfo;
    const details = [
      exif?.fNumber ? `ƒ/${exif.fNumber}` : undefined,
      exif?.exposureTime ? `${exif.exposureTime}s` : undefined,
      exif?.focalLength ? `${exif.focalLength} mm` : undefined,
      exif?.iso ? `ISO ${exif.iso}` : undefined,
    ].filter(Boolean);
    const place = [exif?.city, exif?.country].filter(Boolean).join(', ');
    const camera = [exif?.make, exif?.model].filter(Boolean).join(' ');
    return {
      id: row.id,
      name: row.originalFileName,
      width: exif?.exifImageWidth ?? null,
      height: exif?.exifImageHeight ?? null,
      takenAt: new Date(row.localDateTime).toISOString(),
      place: place || null,
      camera: camera || null,
      settings: details.length > 0 ? details.join('  ·  ') : null,
    };
  }

  /** Every image of a trip, split into the ones the public may see and the ones they may not. */
  private async loadTripPhotos(ownerId: string, name: string, trip: PublicSiteTrip | undefined, folderPublic: boolean) {
    if (isCuratedName(name)) {
      return {
        visible: await this.viewRepository.getImagesByIds(ownerId, [...new Set(curatedPhotoIds(trip))]),
        hidden: [],
      };
    }
    const rows = await this.viewRepository.getAssetsByFolderPerson(
      ownerId,
      await this.getFolderRoot(),
      name,
      true,
      parseFolderAssetFilter({ sort: 'taken', dir: 'asc' }),
      5000,
      0,
      true,
    );
    return {
      visible: rows.filter((row) => isPhotoVisible(trip, folderPublic, row.id)),
      hidden: rows.filter((row) => !isPhotoVisible(trip, folderPublic, row.id)),
    };
  }

  private async buildTripPage(ownerId: string, name: string) {
    const site = await this.getSite();
    const trip = site[name];
    const curated = isCuratedName(name);
    if (curated && !trip?.curated) {
      throw new NotFoundException();
    }
    const folderPublic = !curated && !!(await this.getFolderFlags())[name];
    const { visible, hidden } = await this.loadTripPhotos(ownerId, name, trip, folderPublic);

    const blocks = resolveBlocks(
      trip?.blocks,
      visible.map((row) => ({ id: row.id, takenAt: row.localDateTime })),
    );
    const byId = new Map(visible.map((row) => [row.id, this.toPublicPhoto(row)]));
    const photos = blocks.flatMap((block) =>
      block.type === 'photo' && block.id && byId.has(block.id) ? [byId.get(block.id)!] : [],
    );
    const cover = (await this.systemMetadataRepository.get(SystemMetadataKey.FolderCovers))?.[name];

    return {
      curated,
      folderPublic,
      published: !!trip?.published,
      hidden: hidden.map((row) => this.toPublicPhoto(row)),
      page: {
        name,
        title: trip?.title?.trim() || (curated ? 'Untitled trip' : name),
        intro: trip?.intro?.trim() || null,
        story: trip?.story?.trim() || null,
        assetId: cover && byId.has(cover) ? cover : (photos[0]?.id ?? null),
        photos,
        blocks,
      },
    };
  }

  async getPublicTrips(): Promise<PublicTripDto[]> {
    const ownerId = await this.requireTravel();
    const site = await this.getSite();
    const people = await this.buildFolderPeople(ownerId, true);
    const trips: PublicTripDto[] = [];

    for (const person of people) {
      const trip = site[person.name];
      const hasShown = Object.values(trip?.overrides ?? {}).some(Boolean);
      if (isCuratedName(person.name) || (!person.isPublic && !hasShown)) {
        continue;
      }
      let photoCount = person.assetCount;
      let assetId = person.assetId;
      if (Object.keys(trip?.overrides ?? {}).length > 0) {
        // single photos were hidden or published by hand: count what is really visible
        const { visible } = await this.loadTripPhotos(ownerId, person.name, trip, person.isPublic);
        if (visible.length === 0) {
          continue;
        }
        photoCount = visible.length;
        assetId = visible.some((row) => row.id === assetId) ? assetId : visible[0].id;
      }
      trips.push({
        name: person.name,
        title: trip?.title?.trim() || person.name,
        intro: trip?.intro?.trim() || null,
        curated: false,
        hasStory: !!trip?.story?.trim(),
        photoCount,
        assetId,
      });
    }

    for (const [name, trip] of Object.entries(site)) {
      if (!trip.curated || !trip.published) {
        continue;
      }
      const { visible } = await this.loadTripPhotos(ownerId, name, trip, false);
      const first = resolveBlocks(
        trip.blocks,
        visible.map((row) => ({ id: row.id, takenAt: row.localDateTime })),
      ).find((block) => block.type === 'photo');
      if (!first?.id) {
        continue;
      }
      trips.push({
        name,
        title: trip.title?.trim() || 'Untitled trip',
        intro: trip.intro?.trim() || null,
        curated: true,
        hasStory: !!trip.story?.trim(),
        photoCount: visible.length,
        assetId: first.id,
      });
    }
    return trips;
  }

  private async requirePublicTrip(name: string) {
    const ownerId = await this.requireTravel();
    const trip = (await this.getSite())[name];
    if (isCuratedName(name)) {
      if (!trip?.curated || !trip.published) {
        throw new NotFoundException();
      }
      return ownerId;
    }
    const folderPublic = !!(await this.getFolderFlags())[name];
    const hasShown = Object.values(trip?.overrides ?? {}).some(Boolean);
    if (!this.isSafePath(name) || name.includes('/') || (!folderPublic && !hasShown)) {
      throw new NotFoundException();
    }
    return ownerId;
  }

  async getPublicTripPage(name: string): Promise<PublicTripPageDto> {
    const ownerId = await this.requirePublicTrip(name);
    return (await this.buildTripPage(ownerId, name)).page;
  }

  async getPublicFile(id: string, size: string): Promise<ImmichFileResponse> {
    const ownerId = await this.requireTravel();
    const { originalPath } = await this.assetRepository.getForOriginal(id, false);
    const root = await this.getFolderRoot();
    const relative = originalPath?.startsWith(`${root}/`) ? originalPath.slice(root.length + 1) : undefined;
    if (!relative) {
      throw new NotFoundException();
    }
    const top = relative.includes('/') ? relative.split('/')[0] : undefined;
    const site = await this.getSite();
    const flags = await this.getFolderFlags();
    // the file must be public through its folder (not loose in the root) or through a published curated trip
    const viaFolder = !!top && !isCuratedName(top) && isPhotoVisible(site[top], !!flags[top], id);
    const viaCurated = Object.values(site).some(
      (trip) => trip.curated && trip.published && curatedPhotoIds(trip).includes(id),
    );
    if (!viaFolder && !viaCurated) {
      throw new NotFoundException();
    }
    const [asset] = await this.viewRepository.getImagesByIds(ownerId, [id]);
    if (!asset) {
      throw new NotFoundException();
    }

    if (size in RESIZE_WIDTHS) {
      return this.getResizedFile(id, size);
    }
    // the public side never serves the camera original, whatever size was asked for
    const type = size === 'thumbnail' ? 'thumbnail' : 'preview';
    const { path } = await this.assetRepository.getForThumbnail(id, type as never, false);
    if (!path) {
      throw new NotFoundException();
    }
    return new ImmichFileResponse({
      path,
      contentType: mimeTypes.lookup(path),
      cacheControl: CacheControl.PrivateWithCache,
    });
  }

  private resizing = new Map<string, Promise<void>>();

  /** The resized copy is made once from the preview, kept on disk and served with long caching. */
  async getResizedFile(id: string, size: string): Promise<ImmichFileResponse> {
    const width = RESIZE_WIDTHS[size];
    const { path: source } = await this.assetRepository.getForThumbnail(id, 'preview' as never, false);
    if (!width || !source) {
      throw new NotFoundException();
    }
    const output = join(StorageCore.getMediaLocation(), 'resized', id.slice(0, 2), `${id}-${width}.webp`);
    if (!(await this.storageRepository.checkFileExists(output))) {
      let job = this.resizing.get(output);
      if (!job) {
        const temporary = `${output}.${randomBytes(4).toString('hex')}.tmp`;
        this.storageRepository.mkdirSync(dirname(output));
        job = this.mediaRepository
          .resizeToFile(source, width, temporary)
          .then(() => this.storageRepository.rename(temporary, output))
          .finally(() => this.resizing.delete(output));
        this.resizing.set(output, job);
      }
      await job;
    }
    return new ImmichFileResponse({
      path: output,
      contentType: 'image/webp',
      cacheControl: CacheControl.PrivateWithCache,
    });
  }

  async getResizedFileFor(auth: AuthDto, id: string, size: string): Promise<ImmichFileResponse> {
    await this.requireAccess({ auth, permission: Permission.AssetView, ids: [id] });
    return this.getResizedFile(id, size);
  }

  private requireEditableTrip(site: Record<string, PublicSiteTrip>, name: string) {
    const valid = isCuratedName(name) ? !!site[name]?.curated : this.isSafePath(name) && !name.includes('/');
    if (!valid) {
      throw new NotFoundException();
    }
  }

  async getSiteTrip(auth: AuthDto, name: string): Promise<SiteTripDto> {
    this.requireEditableTrip(await this.getSite(), name);
    const { page, curated, folderPublic, published, hidden } = await this.buildTripPage(auth.user.id, name);
    return { ...page, curated, folderPublic, published, hidden };
  }

  async saveSiteTrip(dto: SiteTripSaveDto): Promise<void> {
    const site = { ...(await this.getSite()) };
    this.requireEditableTrip(site, dto.name);
    const curated = isCuratedName(dto.name);
    const seen = new Set<string>();
    const blocks = cleanBlocks(dto.blocks).filter((block) => {
      if (block.type !== 'photo') {
        return true;
      }
      const duplicate = seen.has(block.id!);
      seen.add(block.id!);
      return !duplicate;
    });
    site[dto.name] = {
      ...(curated ? { curated: true, published: dto.published ?? site[dto.name]?.published ?? false } : {}),
      title: dto.title?.trim() || undefined,
      intro: dto.intro?.trim() || undefined,
      story: dto.story?.trim() || undefined,
      blocks,
      ...(curated ? {} : { overrides: dto.overrides ?? {} }),
    };
    await this.systemMetadataRepository.set(SystemMetadataKey.PublicSite, site);
  }

  async createCuratedTrip(dto: SiteCuratedCreateDto): Promise<SiteTripNameDto> {
    const site = { ...(await this.getSite()) };
    const slug = dto.title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '')
      .slice(0, 30);
    const name = `${CURATED_PREFIX}${slug ? `${slug}-` : ''}${randomBytes(3).toString('hex')}`;
    site[name] = { curated: true, published: false, title: dto.title.trim(), blocks: [] };
    await this.systemMetadataRepository.set(SystemMetadataKey.PublicSite, site);
    return { name };
  }

  async deleteCuratedTrip(name: string): Promise<void> {
    const site = { ...(await this.getSite()) };
    if (!isCuratedName(name) || !site[name]?.curated) {
      throw new NotFoundException();
    }
    delete site[name];
    await this.systemMetadataRepository.set(SystemMetadataKey.PublicSite, site);
  }

  async getCuratedTrips(): Promise<SiteTripSummaryDto[]> {
    return Object.entries(await this.getSite())
      .filter(([, trip]) => trip.curated)
      .map(([name, trip]) => {
        const ids = curatedPhotoIds(trip);
        return {
          name,
          title: trip.title?.trim() || 'Untitled trip',
          curated: true,
          published: !!trip.published,
          photoCount: ids.length,
          assetId: ids[0] ?? null,
        };
      });
  }

  async getAssetsByOriginalPath(auth: AuthDto, path: string): Promise<AssetResponseDto[]> {
    const assets = await this.viewRepository.getAssetsByOriginalPath(auth.user.id, path);
    return assets.map((asset) => mapAsset(asset, { auth }));
  }
}
