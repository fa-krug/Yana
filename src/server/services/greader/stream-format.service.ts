/**
 * Stream format service - handles formatting responses for Google Reader API.
 */

/**
 * Parse item ID from Google Reader format.
 */
export function parseItemId(itemId: string): number {
  if (itemId.startsWith("tag:google.com,2005:reader/item/")) {
    const hexId = itemId.slice(32);
    return parseInt(hexId, 16);
  } else if (itemId.length === 16) {
    try {
      return parseInt(itemId, 16);
    } catch {
      // Fall through
    }
  }
  try {
    return parseInt(itemId, 10);
  } catch {
    return 0;
  }
}

/**
 * Convert article ID to hex format for Google Reader API.
 */
export function toHexId(articleId: number): string {
  return articleId.toString(16).padStart(16, "0");
}

/**
 * Get site URL for a feed.
 */
export function getSiteUrl(article: {
  feedIdentifier: string;
  feedType: string;
}): string {
  if (article.feedType === "reddit") {
    const subreddit = article.feedIdentifier.replace(/^r\//, "");
    return `https://www.reddit.com/r/${subreddit}`;
  }

  if (article.feedType === "youtube") {
    const identifier = article.feedIdentifier;
    if (identifier.startsWith("UC") && identifier.length >= 24) {
      return `https://www.youtube.com/channel/${identifier}`;
    } else if (identifier.startsWith("@")) {
      return `https://www.youtube.com/${identifier}`;
    }
    return "https://www.youtube.com";
  }

  if (
    article.feedIdentifier.startsWith("http://") ||
    article.feedIdentifier.startsWith("https://")
  ) {
    try {
      const url = new URL(article.feedIdentifier);
      return `${url.protocol}//${url.host}`;
    } catch {
      return article.feedIdentifier;
    }
  }

  return article.feedIdentifier;
}

/**
 * Format article for Google Reader API response.
 */
export function formatStreamItem(article: {
  id: number;
  name: string;
  url: string;
  date: Date;
  updatedAt: Date;
  content: string;
  feedId: number;
  feedName: string;
  feedIdentifier: string;
  feedType: string;
}): {
  id: string;
  title: string;
  published: number;
  updated: number;
  crawlTimeMsec: string;
  timestampUsec: string;
  alternate: Array<{ href: string }>;
  canonical: Array<{ href: string }>;
  categories: string[];
  origin: {
    streamId: string;
    title: string;
    htmlUrl: string;
  };
  summary: { content: string };
} {
  const hexId = toHexId(article.id);
  const itemId = `tag:google.com,2005:reader/item/${hexId}`;
  const published = Math.floor(article.date.getTime() / 1000);
  const updated = Math.floor(article.updatedAt.getTime() / 1000);
  const timestampUsec = (article.date.getTime() * 1000).toString();
  const crawlTimeMsec = article.updatedAt.getTime().toString();

  return {
    id: itemId,
    title: article.name,
    published,
    updated,
    crawlTimeMsec,
    timestampUsec,
    alternate: [{ href: article.url }],
    canonical: [{ href: article.url }],
    categories: [
      `user/-/state/com.google/reading-list`,
      `feed/${article.feedId}`,
    ],
    origin: {
      streamId: `feed/${article.feedId}`,
      title: article.feedName,
      htmlUrl: getSiteUrl(article),
    },
    summary: { content: article.content },
  };
}
