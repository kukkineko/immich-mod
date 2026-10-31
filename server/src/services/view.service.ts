import { Injectable } from '@nestjs/common';
import { AssetResponseDto, mapAsset } from 'src/dtos/asset-response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { FolderPersonDto } from 'src/dtos/folder-person.dto';
import { BaseService } from 'src/services/base.service';

/** Top-level folders below this path are treated as people. Set IMMICH_FOLDER_ROOT to change it. */
const getFolderRoot = () => (process.env.IMMICH_FOLDER_ROOT || '/media').replaceAll(/\/+$/g, '');

@Injectable()
export class ViewService extends BaseService {
  getUniqueOriginalPaths(auth: AuthDto): Promise<string[]> {
    return this.viewRepository.getUniqueOriginalPaths(auth.user.id);
  }

  async getFolderPeople(auth: AuthDto): Promise<FolderPersonDto[]> {
    const { counts, faces, fallbacks } = await this.viewRepository.getFolderPeople(auth.user.id, getFolderRoot());
    const faceByFolder = new Map(faces.map((face) => [face.folder, face]));
    const fallbackByFolder = new Map(fallbacks.map((row) => [row.folder, row.assetId]));

    return counts.map(({ folder, count }) => {
      const face = faceByFolder.get(folder);
      return {
        name: folder,
        assetCount: count,
        assetId: face?.assetId ?? fallbackByFolder.get(folder) ?? null,
        faceBox: face
          ? { x1: face.x1 / face.width, y1: face.y1 / face.height, x2: face.x2 / face.width, y2: face.y2 / face.height }
          : null,
      };
    });
  }

  async getAssetsByFolderPerson(auth: AuthDto, name: string, page: number, size: number): Promise<AssetResponseDto[]> {
    if (!name || name.includes('/')) {
      return [];
    }
    const assets = await this.viewRepository.getAssetsByFolderPerson(
      auth.user.id,
      getFolderRoot(),
      name,
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
