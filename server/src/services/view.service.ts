import { Injectable, NotFoundException } from '@nestjs/common';
import { AssetResponseDto, mapAsset } from 'src/dtos/asset-response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { FolderAppSettingsDto, FolderCoverDto, FolderModeDto, FolderPublicDto } from 'src/dtos/folder-app-settings.dto';
import { SystemMetadataKey } from 'src/enum';
import { FolderPersonDto, FolderSubfoldersDto, LooseGroupDto, PublicPhotoDto, PublicTripDto } from 'src/dtos/folder-person.dto';
import { CacheControl } from 'src/enum';
import { ImmichFileResponse } from 'src/utils/file';
import { mimeTypes } from 'src/utils/mime-types';
import { FolderAssetFilter, groupLooseAssets, parseFolderAssetFilter } from 'src/utils/folder-people';
import { BaseService } from 'src/services/base.service';

/** Top-level folders below this path are treated as people. Set IMMICH_FOLDER_ROOT to change it. */
const contentRoot = () => (process.env.IMMICH_FOLDER_ROOT || '/media').replaceAll(/\/+$/g, '');
/** Travel mode can read from its own root, so one development stack can hold both libraries. */
const travelRoot = () => (process.env.IMMICH_TRAVEL_ROOT || process.env.IMMICH_FOLDER_ROOT || '/media').replaceAll(/\/+$/g, '');

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
    };
  }

  private async getFolderRoot() {
    return (await this.getAppSettings()).mode === 'travel' ? travelRoot() : contentRoot();
  }

  async updateAppSettings(dto: FolderAppSettingsDto): Promise<FolderAppSettingsDto> {
    await this.systemMetadataRepository.set(SystemMetadataKey.FolderAppSettings, {
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

    return groupLooseAssets(
      assets,
      faces,
      new Map(names.map((row) => [row.personGroupId, row.name])),
    );
  }

  async getAssetsByFolderPerson(
    auth: AuthDto,
    name: string,
    filter: FolderAssetFilter,
    page: number,
    size: number,
  ): Promise<AssetResponseDto[]> {
    if (!this.isSafePath(name)) {
      return [];
    }
    const parts = name.split('/');
    const flattenSubfolders = parts.length > 1 || (await this.isFlattened(parts[0]));
    const assets = await this.viewRepository.getAssetsByFolderPerson(
      auth.user.id,
      await this.getFolderRoot(),
      name,
      flattenSubfolders,
      filter,
      size,
      page * size,
    );
    return assets.map((asset) => mapAsset(asset, { auth }));
  }

  /** The public side only exists in travel mode and only ever shows folders that were marked public. */
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

  async getPublicTrips(): Promise<PublicTripDto[]> {
    const ownerId = await this.requireTravel();
    const people = await this.buildFolderPeople(ownerId, true);
    return people
      .filter((person) => person.isPublic)
      .map((person) => ({ name: person.name, photoCount: person.assetCount, assetId: person.assetId }));
  }

  private async requirePublicTrip(name: string) {
    const ownerId = await this.requireTravel();
    const flags = (await this.systemMetadataRepository.get(SystemMetadataKey.FolderPublic)) ?? {};
    if (!this.isSafePath(name) || name.includes('/') || !flags[name]) {
      throw new NotFoundException();
    }
    return ownerId;
  }

  async getPublicTripPhotos(name: string, page: number, size: number): Promise<PublicPhotoDto[]> {
    const ownerId = await this.requirePublicTrip(name);
    const rows = await this.viewRepository.getAssetsByFolderPerson(
      ownerId,
      await this.getFolderRoot(),
      name,
      true,
      parseFolderAssetFilter({ sort: 'taken', dir: 'asc' }),
      size,
      page * size,
      true,
    );
    return rows.map((row) => {
      const exif = row.exifInfo;
      const details = [
        exif?.fNumber ? `\u0192/${exif.fNumber}` : undefined,
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
        settings: details.length > 0 ? details.join('  \u00b7  ') : null,
      };
    });
  }

  async getPublicFile(id: string, size: string): Promise<ImmichFileResponse> {
    const ownerId = await this.requireTravel();
    const { originalPath } = await this.assetRepository.getForOriginal(id, false);
    const root = await this.getFolderRoot();
    const relative = originalPath?.startsWith(`${root}/`) ? originalPath.slice(root.length + 1) : undefined;
    const top = relative?.split('/')[0];
    const flags = (await this.systemMetadataRepository.get(SystemMetadataKey.FolderPublic)) ?? {};
    // the file must sit in a public folder (not loose in the root) and belong to the library owner
    if (!relative || !relative.includes('/') || !top || !flags[top]) {
      throw new NotFoundException();
    }
    const [asset] = await this.viewRepository.getAssetsByIds(ownerId, [id], parseFolderAssetFilter({}), 1, 0);
    if (!asset || asset.type !== 'IMAGE') {
      throw new NotFoundException();
    }

    if (size === 'original') {
      return new ImmichFileResponse({
        path: originalPath!,
        contentType: mimeTypes.lookup(originalPath!),
        cacheControl: CacheControl.PrivateWithCache,
      });
    }
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

  async getAssetsByOriginalPath(auth: AuthDto, path: string): Promise<AssetResponseDto[]> {
    const assets = await this.viewRepository.getAssetsByOriginalPath(auth.user.id, path);
    return assets.map((asset) => mapAsset(asset, { auth }));
  }
}
