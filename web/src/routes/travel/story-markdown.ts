import { publicFile } from './travel-types';

const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const PHOTO_ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

const inline = (value: string) =>
  escape(value)
    .replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replaceAll(/\*(.+?)\*/g, '<em>$1</em>')
    .replaceAll(
      /\[([^\]]+)]\((https?:\/\/[^\s)"]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">$1</a>',
    );

/**
 * Light markdown for trip stories: `#`/`##` headings, paragraphs, `-` lists, `>` quotes, **bold**, *italic*, links and
 * `![caption](photo:<id>)` for a public photo. Everything is escaped first, so the result is safe for {@html}.
 */
export const renderStory = (source: string): string =>
  source
    .replaceAll('\r\n', '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const image = /^!\[([^\]]*)]\(photo:([^)]+)\)$/.exec(block);
      if (image && PHOTO_ID.test(image[2])) {
        const caption = image[1].trim();
        return `<figure class="my-10"><img src="${publicFile(image[2], 'preview')}" alt="${escape(caption)}" loading="lazy" class="w-full rounded-2xl" />${
          caption ? `<figcaption class="mt-2 text-center text-sm text-white/60">${inline(caption)}</figcaption>` : ''
        }</figure>`;
      }
      if (block.startsWith('## ')) {
        return `<h3 class="mt-10 mb-3 font-serif text-2xl">${inline(block.slice(3))}</h3>`;
      }
      if (block.startsWith('# ')) {
        return `<h2 class="mt-12 mb-4 font-serif text-3xl">${inline(block.slice(2))}</h2>`;
      }
      if (block.startsWith('> ')) {
        return `<blockquote class="my-6 border-l-2 border-white/30 pl-4 text-white/80 italic">${inline(block.replaceAll(/^> ?/gm, ''))}</blockquote>`;
      }
      if (/^[-*] /.test(block)) {
        const items = block.split('\n').map((line) => `<li>${inline(line.replace(/^[-*] /, ''))}</li>`);
        return `<ul class="my-5 list-disc space-y-1 pl-6">${items.join('')}</ul>`;
      }
      return `<p class="my-5">${inline(block).replaceAll('\n', '<br />')}</p>`;
    })
    .join('\n');
