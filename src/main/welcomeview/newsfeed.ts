// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { XMLParser } from 'fast-xml-parser';
import { INewsItem } from '../config/appdata';

// Parse a blog RSS feed into the news items the welcome view shows. Kept pure
// and separate from the view so the fast-xml-parser usage (which the project
// re-verifies on every parser bump) is unit-tested rather than only checked by
// eye against the live feed. `isArray: item` makes a single-item feed parse to
// an array too, so the caller can always iterate.
export function parseNewsFeed(xml: string, maxNewsToShow = 10): INewsItem[] {
  if (maxNewsToShow <= 0) {
    return [];
  }
  const parser = new XMLParser({ isArray: name => name === 'item' });
  const feed = parser.parse(xml);
  const items = feed?.rss?.channel?.item ?? [];
  const newsList: INewsItem[] = [];
  // Accept only primitive text: a title or link that parsed to an object
  // (nested markup, attributes) becomes '' and the item is skipped rather than
  // rendered as "[object Object]".
  const asText = (value: unknown): string =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  for (const item of items) {
    const title = asText(item?.title);
    const link = asText(item?.link);
    if (!title || !link) {
      continue;
    }
    newsList.push({
      title,
      link: encodeURIComponent(link)
    });
    if (newsList.length === maxNewsToShow) {
      break;
    }
  }
  return newsList;
}
