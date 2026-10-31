import { Injectable } from '@nestjs/common';
import { AssetResponseDto, mapAsset } from 'src/dtos/asset-response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { FolderAppSettingsDto } from 'src/dtos/folder-app-settings.dto';
import { SystemMetadataKey } from 'src/enum';
import { FolderPersonDto, LooseGroupDto } from 'src/dtos/folder-person.dto';
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
    return { title: stored?.title || 'People', pinMode: stored?.pinMode ?? 'every-load' };
  }

  async updateAppSettings(dto: FolderAppSettingsDto): Promise<FolderAppSettingsDto> {
    await this.systemMetadataRepository.set(SystemMetadataKey.FolderAppSettings, {
      title: dto.title,
      pinMode: dto.pinMode,
    });
    return this.getAppSettings();
  }

  async getFolderPeople(auth: AuthDto): Promise<FolderPersonDto[]> {
    const { counts, faces, fallbacks } = await this.viewRepository.getFolderPeople(auth.user.id, getFolderRoot());
    const faceByFolder = new Map(faces.map((face) => [face.folder, face]));
    const fallbackByFolder = new Map(fallbacks.map((row) => [row.folder, row.assetId]));

    const folders: FolderPersonDto[] = counts.map(({ folder, count }) => {
      const face = faceByFolder.get(folder);
      return {
        key: folder,
        kind: 'folder' as const,
        name: folder,
        assetCount: count,
        assetId: face?.assetId ?? fallbackByFolder.get(folder) ?? null,
        faceBox: face
          ? { x1: face.x1 / face.width, y1: face.y1 / face.height, x2: face.x2 / face.width, y2: face.y2 / face.height }
          : null,
      };
    });

    return folders;
  }

  async getLooseMedia(auth: AuthDto): Promise<LooseGroupDto[]> {
    const groups = await this.getLooseGroups(auth);
    if (groups.length === 0) {
      return [];
    }
    const rows = await this.viewRepository.getAssetsByIds(
      auth.user.id,
      groups.flatMap((group) => group.assetIds),
      { sort: 'taken', dir: 'desc', typeFirst: 'any' },
      2000,
      0,
    );
    const byId = new Map(rows.map((row) => [row.id, mapAsset(row, { auth })]));
    return groups.map((group) => ({
      key: group.key,
      kind: group.kind,
      name: group.name,
      assets: group.assetIds
        .map((id) => byId.get(id))
        .filter((asset): asset is AssetResponseDto => !!asset)
        .toSorted((a, b) => b.localDateTime.localeCompare(a.localDateTime)),
    }));
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
    if (!name || name.includes('/')) {
      return [];
    }
    const assets = await this.viewRepository.getAssetsByFolderPerson(
      auth.user.id,
      getFolderRoot(),
      name,
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
