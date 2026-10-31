import { Injectable } from '@nestjs/common';
import { AssetResponseDto, mapAsset } from 'src/dtos/asset-response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { FolderAppSettingsDto, FolderCoverDto, FolderModeDto } from 'src/dtos/folder-app-settings.dto';
import { SystemMetadataKey } from 'src/enum';
import { FolderPersonDto, FolderSubfoldersDto, LooseGroupDto } from 'src/dtos/folder-person.dto';
import { FolderAssetFilter, groupLooseAssets } from 'src/utils/folder-people';
import { BaseService } from 'src/services/base.service';

/** Top-level folders below this path are treated as people. Set IMMICH_FOLDER_ROOT to change it. */
const getFolderRoot = () => (process.env.IMMICH_FOLDER_ROOT || '/media').replaceAll(/\/+$/g, '');

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
    };
  }

  async updateAppSettings(dto: FolderAppSettingsDto): Promise<FolderAppSettingsDto> {
    await this.systemMetadataRepository.set(SystemMetadataKey.FolderAppSettings, {
      title: dto.title,
      pinMode: dto.pinMode,
      flattenSubfolders: dto.flattenSubfolders,
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
    const rows = await this.viewRepository.getSubfolders(auth.user.id, getFolderRoot(), path);
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

  async getFolderPeople(auth: AuthDto): Promise<FolderPersonDto[]> {
    const { counts, faces, fallbacks } = await this.viewRepository.getFolderPeople(auth.user.id, getFolderRoot());
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
    const assets = await this.viewRepository.getLooseAssets(auth.user.id, getFolderRoot());
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
      getFolderRoot(),
      name,
      flattenSubfolders,
      filter,
      size,
      page * size,
    );
    return assets.map((asset) => mapAsset(asset, { auth }));
  }

  async getAssetsByOriginalPath(auth: AuthDto, path: string): Promise<AssetResponseDto[]> {
    const assets = await this.viewRepository.getAssetsByOriginalPath(auth.user.id, path);
    return assets.map((asset) => mapAsset(asset, { auth }));
  }
}
