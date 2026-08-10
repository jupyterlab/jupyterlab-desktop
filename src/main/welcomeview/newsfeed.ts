// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { XMLParser } from 'fast-xml-parser';
import { INewsItem } from '../config/appdata';

// Parse a blog RSS feed into the news items the welcome view shows. Kept pure
// and separate from the view so the fast-xml-parser usage (which the project
// re-verifies on every parser bump) is unit-tested rather than only checked by
// eye against the live feed. `isArray: item` makes a single-item feed parse to
// an array too, so the caller can always iterate. `parseTagValue: false` keeps
// titles as the text the feed published: the default coerces them, which turns
// a title of "0755" into the number 755 and one of "true" into a boolean.
export function parseNewsFeed(xml: string, maxNewsToShow = 10): INewsItem[] {
  if (maxNewsToShow <= 0) {
    return [];
  }
  const parser = new XMLParser({
    isArray: name => name === 'item',
    parseTagValue: false
  });
  const feed = parser.parse(xml);
  const items = feed?.rss?.channel?.item ?? [];
  const newsList: INewsItem[] = [];
  // A title or link that parsed to an object (nested markup, attributes)
  // becomes '' and the item is skipped rather than rendered as
  // "[object Object]".
  const asText = (value: unknown): string =>
    typeof value === 'string' ? value : '';
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
