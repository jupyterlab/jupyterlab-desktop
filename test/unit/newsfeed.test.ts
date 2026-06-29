import { describe, expect, it } from 'vitest';
import { parseNewsFeed } from '../../src/main/welcomeview/newsfeed';

const feed = (items: string) =>
  `<?xml version="1.0"?><rss><channel><title>Jupyter Blog</title>${items}</channel></rss>`;

const item = (title: string, link: string) =>
  `<item><title>${title}</title><link>${link}</link></item>`;

describe('parseNewsFeed', () => {
  it('maps each feed item to a title and an encoded link', () => {
    const xml = feed(
      item('First post', 'https://blog.jupyter.org/first') +
        item('Second post', 'https://blog.jupyter.org/second')
    );

    const news = parseNewsFeed(xml);

    expect(news).toEqual([
      {
        title: 'First post',
        link: encodeURIComponent('https://blog.jupyter.org/first')
      },
      {
        title: 'Second post',
        link: encodeURIComponent('https://blog.jupyter.org/second')
      }
    ]);
  });

  it('percent-encodes query characters in the link', () => {
    const xml = feed(item('Q', 'https://blog.jupyter.org/p?a=b&c=d'));

    const [news] = parseNewsFeed(xml);

    expect(news.link).toBe(
      'https%3A%2F%2Fblog.jupyter.org%2Fp%3Fa%3Db%26c%3Dd'
    );
    expect(news.link).not.toContain('&');
  });

  it('caps the list at maxNewsToShow', () => {
    const xml = feed(
      Array.from({ length: 5 }, (_, i) =>
        item(`Post ${i}`, `https://blog.jupyter.org/${i}`)
      ).join('')
    );

    expect(parseNewsFeed(xml, 2)).toHaveLength(2);
    expect(parseNewsFeed(xml, 2)[1].title).toBe('Post 1');
  });

  it('treats a single-item feed as a one-element list (isArray: item)', () => {
    const xml = feed(item('Only post', 'https://blog.jupyter.org/only'));

    const news = parseNewsFeed(xml);

    expect(news).toHaveLength(1);
    expect(news[0].title).toBe('Only post');
  });

  it('returns an empty list for a feed with no items', () => {
    expect(parseNewsFeed(feed(''))).toEqual([]);
  });

  it('returns an empty list rather than throwing on unexpected XML', () => {
    expect(parseNewsFeed('<not-a-feed/>')).toEqual([]);
  });
});
