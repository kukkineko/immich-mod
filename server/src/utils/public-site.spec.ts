import { PublicSiteBlock } from 'src/types';
import { cleanBlocks, curatedPhotoIds, isPhotoVisible, resolveBlocks } from 'src/utils/public-site';

const photo = (id: string, takenAt: string) => ({ id, takenAt });

describe('public site layout', () => {
  it('puts unlisted photos last, oldest first', () => {
    const blocks = resolveBlocks(
      [{ type: 'photo', id: 'b' }],
      [photo('a', '2026-01-03'), photo('b', '2026-01-01'), photo('c', '2026-01-02')],
    );
    expect(blocks.map((block) => block.id)).toEqual(['b', 'c', 'a']);
  });

  it('drops hidden, unknown and doubled photos but keeps texts', () => {
    const saved: PublicSiteBlock[] = [
      { type: 'heading', text: 'Day 1' },
      { type: 'photo', id: 'a', size: 'wide' },
      { type: 'photo', id: 'a' },
      { type: 'photo', id: 'gone' },
      { type: 'text', text: 'Hello' },
    ];
    expect(resolveBlocks(saved, [photo('a', '2026-01-01')])).toEqual([
      { type: 'heading', text: 'Day 1' },
      { type: 'photo', id: 'a', size: 'wide' },
      { type: 'text', text: 'Hello' },
    ]);
  });

  it('lets a photo choice win over the folder flag', () => {
    expect(isPhotoVisible(undefined, true, 'a')).toBe(true);
    expect(isPhotoVisible({ overrides: { a: false } }, true, 'a')).toBe(false);
    expect(isPhotoVisible({ overrides: { a: true } }, false, 'a')).toBe(true);
    expect(isPhotoVisible({ overrides: { b: true } }, false, 'a')).toBe(false);
  });

  it('cleans empty blocks and unused fields', () => {
    expect(
      cleanBlocks([
        { type: 'text', text: '   ' },
        { type: 'photo', id: 'a', caption: ' ', text: 'x' },
        { type: 'heading', text: ' Hi ', id: 'zzz' },
      ]),
    ).toEqual([
      { type: 'photo', id: 'a' },
      { type: 'heading', text: 'Hi' },
    ]);
    expect(
      curatedPhotoIds({
        blocks: [
          { type: 'text', text: 'x' },
          { type: 'photo', id: 'a' },
        ],
      }),
    ).toEqual(['a']);
  });
});
