import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { AssetVisibility } from 'src/enum';
import { DB } from 'src/schema';
import { asUuid, withExif } from 'src/utils/database';

const escapeRegex = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const escapeLike = (value: string) => value.replaceAll(/[%_\\]/g, String.raw`\$&`);

export class ViewRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({ params: [DummyValue.UUID] })
  async getUniqueOriginalPaths(userId: string) {
    const results = await this.db
      .selectFrom('asset')
      .select((eb) => eb.fn<string>('substring', ['asset.originalPath', eb.val('^(.*/)[^/]*$')]).as('directoryPath'))
      .distinct()
      .where('ownerId', '=', asUuid(userId))
      .where('visibility', '=', AssetVisibility.Timeline)
      .where('deletedAt', 'is', null)
      .where('fileCreatedAt', 'is not', null)
      .where('fileModifiedAt', 'is not', null)
      .where('localDateTime', 'is not', null)
      .orderBy('directoryPath', 'asc')
      .execute();

    return results.map((row) => row.directoryPath.replaceAll(/\/$/g, ''));
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.STRING] })
  async getAssetsByOriginalPath(userId: string, partialPath: string) {
    const normalizedPath = partialPath.replaceAll(/\/$/g, '');

    return this.db
      .selectFrom('asset')
      .selectAll('asset')
      .$call(withExif)
      .where('ownerId', '=', asUuid(userId))
      .where('visibility', '=', AssetVisibility.Timeline)
      .where('deletedAt', 'is', null)
      .where('fileCreatedAt', 'is not', null)
      .where('fileModifiedAt', 'is not', null)
      .where('localDateTime', 'is not', null)
      .where('originalPath', 'like', `%${normalizedPath}/%`)
      .where('originalPath', 'not like', `%${normalizedPath}/%/%`)
      .orderBy(
        (eb) => eb.fn('regexp_replace', ['asset.originalPath', eb.val('.*/(.+)'), eb.val(String.raw`\1`)]),
        'asc',
      )
      .execute();
  }

  private folderAssets(userId: string, root: string) {
    const pattern = `^${escapeRegex(root)}/([^/]+)/`;
    return sql`
      select a.id, a."type", a."localDateTime", substring(a."originalPath" from ${pattern}) as folder
      from asset a
      where a."ownerId" = ${userId}
        and a.visibility = ${AssetVisibility.Timeline}
        and a."deletedAt" is null
        and a."originalPath" like ${escapeLike(root) + '/%'}
    `;
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.STRING] })
  async getFolderPeople(userId: string, root: string) {
    const assets = this.folderAssets(userId, root);

    const counts = await sql<{ folder: string; count: number }>`
      with a as (${assets})
      select folder, count(*)::int as count from a where folder is not null group by folder order by folder
    `.execute(this.db);

    const faces = await sql<{
      folder: string;
      assetId: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      width: number;
      height: number;
    }>`
      with a as (${assets})
      select distinct on (a.folder) a.folder, a.id as "assetId",
        f."boundingBoxX1" as x1, f."boundingBoxY1" as y1, f."boundingBoxX2" as x2, f."boundingBoxY2" as y2,
        f."imageWidth" as width, f."imageHeight" as height
      from a
      inner join asset_face f on f."assetId" = a.id
      where a.folder is not null and a."type" = 'IMAGE'
        and f."deletedAt" is null and f."isVisible" and f."imageWidth" > 0 and f."imageHeight" > 0
      order by a.folder, (f."boundingBoxX2" - f."boundingBoxX1") * (f."boundingBoxY2" - f."boundingBoxY1") desc
    `.execute(this.db);

    const fallbacks = await sql<{ folder: string; assetId: string }>`
      with a as (${assets})
      select distinct on (folder) folder, id as "assetId"
      from a where folder is not null and "type" = 'IMAGE'
      order by folder, "localDateTime" desc
    `.execute(this.db);

    return { counts: counts.rows, faces: faces.rows, fallbacks: fallbacks.rows };
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.STRING, DummyValue.STRING, DummyValue.NUMBER, DummyValue.NUMBER] })
  getAssetsByFolderPerson(userId: string, root: string, name: string, limit: number, offset: number) {
    return this.db
      .selectFrom('asset')
      .selectAll('asset')
      .$call(withExif)
      .where('ownerId', '=', asUuid(userId))
      .where('visibility', '=', AssetVisibility.Timeline)
      .where('deletedAt', 'is', null)
      .where('originalPath', 'like', `${escapeLike(root)}/${escapeLike(name)}/%`)
      .orderBy('localDateTime', 'desc')
      .orderBy('id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute();
  }
}
