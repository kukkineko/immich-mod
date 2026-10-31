import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AssetResponseDto } from 'src/dtos/asset-response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { FolderPersonDto } from 'src/dtos/folder-person.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { ViewService } from 'src/services/view.service';

@ApiTags(ApiTag.Views)
@Controller('view')
export class ViewController {
  constructor(private service: ViewService) {}

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

  @Get('folder-people/assets')
  @Authenticated({ permission: Permission.FolderRead })
  @Endpoint({
    summary: 'Retrieve folder person assets',
    description: 'Retrieve all assets of a top-level folder, including every subfolder, newest first.',
    history: new HistoryBuilder().added('v2'),
  })
  getAssetsByFolderPerson(
    @Auth() auth: AuthDto,
    @Query('name') name: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<AssetResponseDto[]> {
    return this.service.getAssetsByFolderPerson(
      auth,
      name,
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
