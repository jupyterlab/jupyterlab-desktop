// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { XMLParser } from 'fast-xml-parser';
import { INewsItem } from '../config/appdata';

// nested markup parses to an object, which would render as "[object Object]"
const asText = (value: unknown): string =>
  typeof value === 'string' ? value : '';

// Kept out of the view so the fast-xml-parser usage, which this project
// re-verifies on every parser bump, is covered by unit tests.
export function parseNewsFeed(xml: string, maxNewsToShow = 10): INewsItem[] {
  if (maxNewsToShow <= 0) {
    return [];
  }
  const parser = new XMLParser({
    // a single-item feed parses to an array too, so the caller can iterate
    isArray: name => name === 'item',
    // without it a title of "0755" comes back as the number 755
    parseTagValue: false
  });
  const feed = parser.parse(xml);
  const items = feed?.rss?.channel?.item ?? [];
  const newsList: INewsItem[] = [];
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
