/**
 * RSS feed routes.
 *
 * Provides RSS feed generation for external RSS readers.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { loadUser } from '../middleware/auth';
import { getFeed } from '../services/feed.service';
import { eq, desc } from 'drizzle-orm';
import { db, articles } from '../db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { NotFoundError, PermissionDeniedError } from '../errors';
import { authenticateUser } from '../services/user.service';

const router = Router();

/**
 * Authenticate request using session or HTTP Basic Auth.
 */
async function authenticateRssRequest(
  req: Request
): Promise<{ id: number; username: string } | null> {
  const authReq = req as AuthenticatedRequest;

  // Try session authentication first
  if (authReq.user) {
    return {
      id: authReq.user.id,
      username: authReq.user.username,
    };
  }

  // Try HTTP Basic Auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }

  try {
    // Decode base64 credentials
    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':', 2);

    // Authenticate user
    try {
      const user = await authenticateUser(username, password);
      return {
        id: user.id,
        username: user.username,
      };
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Generate RSS feed XML.
 */
function generateRssFeed(
  feed: { id: number; name: string; identifier: string },
  feedArticles: Array<{
    id: number;
    name: string;
    url: string;
    date: Date;
    content: string;
    author: string | null;
  }>
): string {
  const baseUrl = process.env['BASE_URL'] || 'http://localhost:3000';
  const feedUrl = `${baseUrl}/feeds/${feed.id}/rss.xml`;
  const feedLink = feed.identifier;
  const feedDescription = `Aggregated feed for ${feed.name}`;

  const items = feedArticles
    .map(article => {
      const itemUrl = article.url;
      const itemTitle = escapeXml(article.name);
      const itemDescription = escapeXml(article.content);
      const itemPubDate = new Date(article.date).toUTCString();
      const itemAuthor = article.author ? escapeXml(article.author) : '';

      return `    <item>
      <title>${itemTitle}</title>
      <link>${itemUrl}</link>
      <description>${itemDescription}</description>
      <pubDate>${itemPubDate}</pubDate>
      ${itemAuthor ? `<author>${itemAuthor}</author>` : ''}
      <guid isPermaLink="false">${baseUrl}/articles/${article.id}</guid>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(feed.name)}</title>
    <link>${feedLink}</link>
    <description>${escapeXml(feedDescription)}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>Yana RSS Feed Generator</generator>
${items}
  </channel>
</rss>`;
}

/**
 * Escape XML special characters.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * GET /feeds/:feedId/rss.xml
 * Generate RSS feed for a feed
 * Supports authentication via session or HTTP Basic Auth
 */
router.get(
  '/feeds/:feedId/rss.xml',
  loadUser,
  asyncHandler(async (req: Request, res: Response) => {
    const { feedId } = req.params;
    const feedIdNum = parseInt(feedId, 10);

    if (isNaN(feedIdNum)) {
      throw new NotFoundError('Feed not found');
    }

    // Authenticate request
    const user = await authenticateRssRequest(req);
    if (!user) {
      res.status(401);
      res.setHeader('WWW-Authenticate', 'Basic realm="Yana RSS Feeds"');
      res.send('Authentication required');
      return;
    }

    // Get feed
    const feed = await getFeed(feedIdNum, { id: user.id, isSuperuser: false });

    // Get articles (limit 50, newest first)
    const feedArticles = await db
      .select({
        id: articles.id,
        name: articles.name,
        url: articles.url,
        date: articles.date,
        content: articles.content,
        author: articles.author,
      })
      .from(articles)
      .where(eq(articles.feedId, feedIdNum))
      .orderBy(desc(articles.date))
      .limit(50);

    // Generate RSS feed
    const rssXml = generateRssFeed(feed, feedArticles);

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(rssXml);
  })
);

export function rssRoutes(): Router {
  return router;
}
