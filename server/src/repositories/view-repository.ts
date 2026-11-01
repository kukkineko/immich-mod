import { Kysely, SelectQueryBuilder, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { AssetType, AssetVisibility } from 'src/enum';
import { DB } from 'src/schema';
import { asUuid, withExif } from 'src/utils/database';
import { FolderAssetFilter } from 'src/utils/folder-people';

const escapeRegex = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const escapeLike = (value: string) => value.replaceAll(/[%_\\]/g, String.raw`\$&`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyAssetFilter = <QB extends SelectQueryBuilder<any, any, any>>(qb: QB, filter: FolderAssetFilter): QB => {
  let query: SelectQueryBuilder<any, any, any> = qb
    .$if(!!filter.q, (eb) => {
      // file name, place, caption, text found in the picture (OCR) and the names of recognised people
      const like = `%${escapeLike(filter.q!)}%`;
      return eb.where(
        sql<boolean>`(
          asset."originalFileName" ilike ${like}
          or asset_exif."city" ilike ${like}
          or asset_exif."state" ilike ${like}
          or asset_exif."country" ilike ${like}
          or asset_exif."description" ilike ${like}
          or exists (select 1 from asset_ocr o where o."assetId" = asset.id and o."text" ilike ${like})
          or exists (
            select 1 from asset_face f inner join person p on p."personGroupId" = f."personGroupId"
            where f."assetId" = asset.id and f."deletedAt" is null and p."name" ilike ${like}
          )
        )`,
      );
    })
    .$if(!!filter.takenFrom, (eb) => eb.where('asset.localDateTime', '>=', filter.takenFrom!))
    .$if(!!filter.takenTo, (eb) => eb.where('asset.localDateTime', '<', filter.takenTo!))
    .$if(!!filter.updatedFrom, (eb) => eb.where('asset.fileModifiedAt', '>=', filter.updatedFrom!))
    .$if(!!filter.updatedTo, (eb) => eb.where('asset.fileModifiedAt', '<', filter.updatedTo!))
    .$if(filter.minSize !== undefined, (eb) => eb.where('asset_exif.fileSizeInByte', '>=', filter.minSize!))
    .$if(filter.maxSize !== undefined, (eb) => eb.where('asset_exif.fileSizeInByte', '<=', filter.maxSize!))
    .$if(filter.minDuration !== undefined, (eb) => eb.where('asset.duration', '>=', filter.minDuration!))
    .$if(filter.maxDuration !== undefined, (eb) => eb.where('asset.duration', '<=', filter.maxDuration!));

  // favourites are pinned to the top of every list
  query = query.orderBy('asset.isFavorite', 'desc');

  if (filter.typeFirst !== 'any') {
    const first = filter.typeFirst === 'video' ? 'VIDEO' : 'IMAGE';
    query = query.orderBy(sql`case when asset."type" = ${first} then 0 else 1 end`);
  }

  const columns = {
    taken: 'asset.localDateTime',
    updated: 'asset.fileModifiedAt',
    name: 'asset.originalFileName',
    size: 'asset_exif.fileSizeInByte',
    duration: 'asset.duration',
  } as const;
  return query
    .orderBy(columns[filter.sort], (ob) => (filter.dir === 'asc' ? ob.asc().nullsLast() : ob.desc().nullsLast()))
    .orderBy('asset.id', 'asc') as QB;
};

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
  async getFolderPeople(userId: string, root: string, imagesOnly = false) {
    const assets = this.folderAssets(userId, root);
    const onlyImages = imagesOnly ? sql`and "type" = 'IMAGE'` : sql``;

    const counts = await sql<{ folder: string; count: number }>`
      with a as (${assets})
      select folder, count(*)::int as count from a where folder is not null ${onlyImages} group by folder order by folder
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

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.STRING] })
  getLooseAssets(userId: string, root: string) {
    return this.db
      .selectFrom('asset')
      .select(['asset.id', 'asset.type', 'asset.localDateTime'])
      .where('ownerId', '=', asUuid(userId))
      .where('visibility', '=', AssetVisibility.Timeline)
      .where('deletedAt', 'is', null)
      .where('originalPath', 'like', `${escapeLike(root)}/%`)
      .where('originalPath', 'not like', `${escapeLike(root)}/%/%`)
      .execute();
  }

  async getLooseFaces(assetIds: string[]) {
    if (assetIds.length === 0) {
      return [];
    }
    return this.db
      .selectFrom('asset_face')
      .select([
        'assetId',
        'personGroupId',
        'boundingBoxX1 as x1',
        'boundingBoxY1 as y1',
        'boundingBoxX2 as x2',
        'boundingBoxY2 as y2',
        'imageWidth as width',
        'imageHeight as height',
      ])
      .where('assetId', 'in', assetIds)
      .where('deletedAt', 'is', null)
      .where('isVisible', '=', true)
      .execute();
  }

  async getPersonGroupNames(userId: string, groupIds: string[]) {
    if (groupIds.length === 0) {
      return [];
    }
    return this.db
      .selectFrom('person')
      .select(['personGroupId', 'name'])
      .where('ownerId', '=', asUuid(userId))
      .where('personGroupId', 'in', groupIds)
      .where('name', '!=', '')
      .execute();
  }

  getAssetsByIds(userId: string, ids: string[], filter: FolderAssetFilter, limit: number, offset: number) {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.db
      .selectFrom('asset')
      .selectAll('asset')
      .$call(withExif)
      .where('asset.ownerId', '=', asUuid(userId))
      .where('asset.id', 'in', ids)
      .$call((qb) => applyAssetFilter(qb, filter))
      .limit(limit)
      .offset(offset)
      .execute();
  }

  async getSubfolders(userId: string, root: string, path: string) {
    const base = `${root}/${path}`;
    const result = await sql<{ name: string; count: number; assetId: string }>`
      select sub as name, count(*)::int as count,
        (array_agg(id order by ("type" = 'IMAGE') desc, "localDateTime" desc))[1] as "assetId"
      from (
        select a.id, a."type", a."localDateTime", substring(a."originalPath" from ${`^${escapeRegex(base)}/([^/]+)/`}) as sub
        from asset a
        where a."ownerId" = ${userId}
          and a.visibility = ${AssetVisibility.Timeline}
          and a."deletedAt" is null
          and a."originalPath" like ${escapeLike(base) + '/%'}
      ) t
      where sub is not null
      group by sub order by sub
    `.execute(this.db);
    return result.rows;
  }

  getAssetsByFolderPerson(
    userId: string,
    root: string,
    name: string,
    flatten: boolean,
    filter: FolderAssetFilter,
    limit: number,
    offset: number,
    imagesOnly = false,
  ) {
    return this.db
      .selectFrom('asset')
      .selectAll('asset')
      .$call(withExif)
      .where('asset.ownerId', '=', asUuid(userId))
      .where('asset.visibility', '=', AssetVisibility.Timeline)
      .where('asset.deletedAt', 'is', null)
      .where('asset.originalPath', 'like', `${escapeLike(root)}/${escapeLike(name)}/%`)
      .$if(imagesOnly, (eb) => eb.where('asset.type', '=', AssetType.Image))
      .$if(!flatten, (eb) => eb.where('asset.originalPath', 'not like', `${escapeLike(root)}/${escapeLike(name)}/%/%`))
      .$call((qb) => applyAssetFilter(qb, filter))
      .limit(limit)
      .offset(offset)
      .execute();
  }
}
