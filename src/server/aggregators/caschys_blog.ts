/**
 * Caschys Blog aggregator.
 *
 * Specialized aggregator for Caschys Blog (German tech blog).
 */

import { FullWebsiteAggregator } from './full_website';
import type { RawArticle } from './base/types';
import { fetchArticleContent } from './base/fetch';
import { extractContent } from './base/extract';
import { standardizeContentFormat } from './base/process';
import { sanitizeHtml } from './base/utils';
import { logger } from '../utils/logger';

export class CaschysBlogAggregator extends FullWebsiteAggregator {
  override readonly id = 'caschys_blog';
  override readonly type: 'managed' | 'custom' | 'social' = 'managed';
  override readonly name = 'Caschys Blog';
  override readonly url = 'https://stadt-bremerhaven.de/feed/';
  override readonly description =
    'Caschys Blog - German technology blog covering tech news and reviews.';

  override readonly waitForSelector = '.entry-inner';
  override readonly selectorsToRemove = [
    '.aawp',
    '.aawp-disclaimer',
    'script',
    'style',
    'iframe',
    'noscript',
    'svg',
  ];

  override readonly identifierEditable = false;

  protected override shouldSkipArticle(article: RawArticle): boolean {
    // Skip articles marked as advertisements (Anzeige)
    if (article.title.includes('(Anzeige)')) {
      logger.info({ title: article.title }, 'Skipping advertisement');
      return true;
    }

    return super.shouldSkipArticle(article);
  }

  override async aggregate(articleLimit?: number): Promise<RawArticle[]> {
    if (!this.feed) {
      throw new Error('Feed not initialized');
    }

    // Call parent aggregate to get base articles
    const articles = await super.aggregate(articleLimit);

    // Process each article with Caschys Blog-specific content extraction
    for (const article of articles) {
      try {
        // Skip if article already exists (unless force refresh)
        if (this.isExistingUrl(article.url)) {
          logger.debug(
            {
              url: article.url,
              title: article.title,
              aggregator: this.id,
              step: 'skip_existing',
            },
            'Skipping existing article (will not fetch content)'
          );
          continue;
        }

        // Fetch article HTML
        const html = await fetchArticleContent(article.url, {
          timeout: this.fetchTimeout,
          waitForSelector: this.waitForSelector,
        });

        // Extract content from .entry-inner element
        const extracted = extractContent(html, {
          selectorsToRemove: this.selectorsToRemove,
          contentSelector: '.entry-inner',
        });

        if (!extracted || extracted.trim().length === 0) {
          logger.warn({ url: article.url }, 'Could not find .entry-inner content, using summary');
          article.content = article.summary || '';
          continue;
        }

        // Sanitize HTML (remove scripts, rename attributes)
        const sanitizedContent = sanitizeHtml(extracted);

        // Standardize format (add header image, source link)
        const generateTitleImage = this.feed?.generateTitleImage ?? true;
        const addSourceFooter = this.feed?.addSourceFooter ?? true;
        article.content = await standardizeContentFormat(
          sanitizedContent,
          article,
          article.url,
          generateTitleImage,
          addSourceFooter
        );
      } catch (error) {
        logger.error({ error, url: article.url }, 'Error processing Caschys Blog article');
        // Continue with summary if available
        article.content = article.summary || '';
      }
    }

    return articles;
  }
}
