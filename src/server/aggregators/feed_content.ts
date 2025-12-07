/**
 * RSS-Only aggregator.
 *
 * Lightweight aggregator that uses content directly from the RSS feed
 * without fetching full articles from the web.
 */

import { BaseAggregator } from './base/aggregator';
import type { RawArticle } from './base/types';
import { fetchFeed } from './base/fetch';
import { processContent } from './base/process';
import { sanitizeHtml } from './base/utils';
import { logger } from '../utils/logger';

export class FeedContentAggregator extends BaseAggregator {
  override readonly id: string = 'feed_content';
  override readonly type: 'managed' | 'custom' | 'social' = 'custom';
  override readonly name: string = 'RSS-Only';
  override readonly url: string = '';
  override readonly description: string =
    'RSS feeds with full content already included in the feed.';

  async aggregate(articleLimit?: number): Promise<RawArticle[]> {
    const aggregateStart = Date.now();
    logger.info(
      {
        aggregator: this.id,
        feedId: this.feed?.id,
        articleLimit,
        step: 'aggregate_start',
      },
      `Starting RSS-Only aggregation${articleLimit ? ` (limit: ${articleLimit})` : ''}`
    );

    if (!this.feed) {
      throw new Error('Feed not initialized');
    }

    const feedUrl = this.feed.identifier;
    logger.info(
      {
        feedUrl,
        aggregator: this.id,
        step: 'fetch_feed_start',
      },
      'Fetching RSS feed'
    );

    // Fetch RSS feed
    const feedFetchStart = Date.now();
    const feed = await fetchFeed(feedUrl);
    const feedFetchElapsed = Date.now() - feedFetchStart;

    logger.info(
      {
        feedUrl,
        itemCount: feed.items?.length || 0,
        elapsed: feedFetchElapsed,
        aggregator: this.id,
        step: 'fetch_feed_complete',
      },
      'RSS feed fetched, processing items'
    );

    const articles: RawArticle[] = [];
    let itemsToProcess = feed.items || [];

    // Apply article limit if specified
    if (articleLimit !== undefined && articleLimit > 0) {
      itemsToProcess = itemsToProcess.slice(0, articleLimit);
      logger.info(
        {
          originalCount: feed.items?.length || 0,
          limitedCount: itemsToProcess.length,
          articleLimit,
          aggregator: this.id,
          step: 'apply_limit',
        },
        `Limited to first ${articleLimit} item(s)`
      );
    }

    logger.info(
      {
        itemCount: itemsToProcess.length,
        aggregator: this.id,
        step: 'process_items_start',
      },
      `Processing ${itemsToProcess.length} feed items`
    );

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      const itemStart = Date.now();

      try {
        logger.debug(
          {
            index: i + 1,
            total: itemsToProcess.length,
            title: item.title,
            url: item.link,
            aggregator: this.id,
            step: 'process_item_start',
          },
          `Processing item ${i + 1}/${itemsToProcess.length}`
        );

        const article: RawArticle = {
          title: item.title || '',
          url: item.link || '',
          published: item.pubDate ? new Date(item.pubDate) : new Date(),
          content: item.content || item.contentSnippet || '',
          summary: item.contentSnippet || item.content || '',
          author: item.creator || item.author || undefined,
        };

        // Skip if should skip
        if (this.shouldSkipArticle(article)) {
          logger.debug(
            {
              index: i + 1,
              title: article.title,
              aggregator: this.id,
              step: 'item_skipped',
            },
            'Item skipped by shouldSkipArticle'
          );
          continue;
        }

        // Check if article already exists - skip if it does (unless force refresh)
        if (this.isExistingUrl(article.url)) {
          logger.debug(
            {
              index: i + 1,
              url: article.url,
              title: article.title,
              aggregator: this.id,
              step: 'skip_existing',
            },
            'Skipping existing article'
          );
          continue;
        }

        // Use RSS content directly - no need to fetch from web
        let content = article.content || article.summary || '';

        // Sanitize HTML (remove scripts, rename attributes)
        const sanitizedContent = sanitizeHtml(content);

        // Process content (standardize format with source link)
        const processStart = Date.now();
        const generateTitleImage = this.feed?.generateTitleImage ?? true;
        const addSourceFooter = this.feed?.addSourceFooter ?? true;

        const processedContent = await processContent(
          sanitizedContent,
          article,
          generateTitleImage,
          addSourceFooter
        );
        const processElapsed = Date.now() - processStart;

        logger.debug(
          {
            index: i + 1,
            url: article.url,
            elapsed: processElapsed,
            aggregator: this.id,
            step: 'process_complete',
          },
          'Content processed'
        );

        // Update article with processed content
        article.content = processedContent;

        articles.push(article);

        const itemElapsed = Date.now() - itemStart;
        logger.debug(
          {
            index: i + 1,
            total: itemsToProcess.length,
            title: article.title,
            elapsed: itemElapsed,
            aggregator: this.id,
            step: 'item_complete',
          },
          `Item ${i + 1}/${itemsToProcess.length} processed`
        );
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error : new Error(String(error)),
            index: i + 1,
            title: item.title,
            url: item.link,
            aggregator: this.id,
            step: 'item_error',
          },
          'Error processing item'
        );
        continue;
      }
    }

    const aggregateElapsed = Date.now() - aggregateStart;
    logger.info(
      {
        aggregator: this.id,
        feedId: this.feed.id,
        articleCount: articles.length,
        elapsed: aggregateElapsed,
        step: 'aggregate_complete',
      },
      `RSS-Only aggregation completed: ${articles.length} article(s)`
    );

    return articles;
  }
}
