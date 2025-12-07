/**
 * Mein-MMO aggregator.
 *
 * Specialized aggregator for Mein-MMO.de (German gaming news).
 */

import { FullWebsiteAggregator } from './full_website';
import type { RawArticle } from './base/types';
import { fetchArticleContent } from './base/fetch';
import { extractContent } from './base/extract';
import { standardizeContentFormat } from './base/process';
import { sanitizeHtml } from './base/utils';
import { logger } from '../utils/logger';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { ContentFetchError } from './base/exceptions';

export class MeinMmoAggregator extends FullWebsiteAggregator {
  override readonly id = 'mein_mmo';
  override readonly type: 'managed' | 'custom' | 'social' = 'managed';
  override readonly name = 'Mein-MMO';
  override readonly url = 'https://mein-mmo.de/feed/';
  override readonly description =
    'Mein-MMO.de - German gaming news website covering MMO and online gaming topics.';

  override readonly waitForSelector = 'div.gp-entry-content';
  override readonly selectorsToRemove = [
    'div.wp-block-mmo-video',
    'div.wp-block-mmo-recirculation-box',
    'div.reading-position-indicator-end',
    'label.toggle',
    'a.wp-block-mmo-content-box',
    'ul.page-numbers',
    '.post-page-numbers',
    '#ftwp-container-outer',
    'script',
    'style',
    'iframe',
    'noscript',
  ];

  override readonly options = {
    // Inherit options from FullWebsiteAggregator
    exclude_selectors: {
      type: 'string' as const,
      label: 'CSS selectors to exclude (one per line)',
      helpText:
        'Additional CSS selectors for elements to remove from content. Enter one selector per line.\n\nExample:\n.advertisement\n.social-share\nfooter\nscript',
      default: '',
      required: false,
      widget: 'textarea' as const,
    },
    ignore_title_contains: {
      type: 'string' as const,
      label: 'Ignore articles if title contains (one per line)',
      helpText:
        'Skip articles if the title contains any of these strings (case-insensitive). Enter one string per line.\n\nExample:\n[SPONSORED]\nAdvertisement\nPremium',
      default: '',
      required: false,
      widget: 'textarea' as const,
    },
    ignore_content_contains: {
      type: 'string' as const,
      label: 'Ignore articles if content contains (one per line)',
      helpText:
        'Skip articles if the title or content contains any of these strings (case-insensitive). Enter one string per line.\n\nExample:\npaywall\nsubscription required\nmembers only',
      default: '',
      required: false,
      widget: 'textarea' as const,
    },
    regex_replacements: {
      type: 'string' as const,
      label: 'Regex replacements (one per line)',
      helpText:
        'Apply regex replacements to article content. One replacement per line in format: pattern|replacement\n\nApplied sequentially after all other processing.\n\nExample:\nfoo|bar\n\\d{4}|YEAR\n^\\s+|  (remove leading spaces)\n\nNote: Use | to separate pattern from replacement. To include a literal |, escape it as \\|',
      default: '',
      required: false,
      widget: 'textarea' as const,
    },
    // Mein-MMO-specific options
    traverse_multipage: {
      type: 'boolean' as const,
      label: 'Traverse multi-page articles',
      helpText: 'Fetch and combine all pages of multi-page articles into a single article',
      default: false,
      required: false,
    },
  };

  override async aggregate(articleLimit?: number): Promise<RawArticle[]> {
    if (!this.feed) {
      throw new Error('Feed not initialized');
    }

    // Get options
    const traverseMultipage = this.getOption('traverse_multipage', false) as boolean;

    // Call parent aggregate to get base articles
    const articles = await super.aggregate(articleLimit);

    // Process each article with Mein-MMO-specific logic
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

        // Fetch article HTML (with multi-page support if enabled)
        let html: string;
        let isMultiPage = false;
        if (traverseMultipage) {
          html = await this.fetchAllPages(article.url);
          // fetchAllPages returns combined content divs, so we need to handle extraction differently
          isMultiPage = true;
        } else {
          html = await fetchArticleContent(article.url, {
            timeout: this.fetchTimeout,
            waitForSelector: this.waitForSelector,
          });
        }

        // Extract and process content with Mein-MMO-specific logic
        // For multi-page articles, fetchAllPages already returns combined content divs
        const processed = await this.extractContent(html, article, isMultiPage);

        // Sanitize HTML
        const sanitized = sanitizeHtml(processed);

        // Standardize format (add header image, source link)
        const generateTitleImage = this.feed?.generateTitleImage ?? true;
        const addSourceFooter = this.feed?.addSourceFooter ?? true;
        const headerImageUrl = this.getHeaderImageUrl(html, article);
        article.content = await standardizeContentFormat(
          sanitized,
          article,
          article.url,
          generateTitleImage,
          addSourceFooter,
          headerImageUrl
        );
      } catch (error) {
        logger.error({ error, url: article.url }, 'Error processing Mein-MMO article');
        // Continue with original content if processing fails
      }
    }

    return articles;
  }

  /**
   * Fetch all pages of a multi-page article and combine the content.
   */
  private async fetchAllPages(baseUrl: string): Promise<string> {
    logger.info({ url: baseUrl }, 'Fetching multi-page article');

    // Fetch first page
    const firstPageHtml = await fetchArticleContent(baseUrl, {
      timeout: this.fetchTimeout,
      waitForSelector: this.waitForSelector,
    });

    // Extract page numbers from pagination
    const pageNumbers = this.extractPageNumbers(firstPageHtml);

    if (pageNumbers.size <= 1) {
      logger.info({ url: baseUrl }, 'Single page article detected');
      return firstPageHtml;
    }

    const maxPage = Math.max(...Array.from(pageNumbers));
    logger.info({ url: baseUrl, maxPage }, 'Multi-page article detected');

    // Extract content from first page
    const $first = cheerio.load(firstPageHtml);
    const contentDiv = $first('div.gp-entry-content').first();

    if (contentDiv.length === 0) {
      logger.warn({ url: baseUrl }, 'Could not find content div on first page');
      return firstPageHtml;
    }

    // Collect all content parts
    const allContentParts: string[] = [contentDiv.html() || ''];

    // Fetch remaining pages
    const baseUrlClean = baseUrl.replace(/\/$/, '');
    for (let pageNum = 2; pageNum <= maxPage; pageNum++) {
      const pageUrl = `${baseUrlClean}/${pageNum}/`;
      logger.info({ url: pageUrl, pageNum, maxPage }, 'Fetching page');

      try {
        const pageHtml = await fetchArticleContent(pageUrl, {
          timeout: this.fetchTimeout,
          waitForSelector: this.waitForSelector,
        });

        const $page = cheerio.load(pageHtml);
        const pageContent = $page('div.gp-entry-content').first();

        if (pageContent.length > 0) {
          allContentParts.push(pageContent.html() || '');
          logger.info({ pageNum, maxPage }, 'Page fetched successfully');
        } else {
          logger.warn({ pageNum, maxPage }, 'Could not find content div on page');
        }
      } catch (error) {
        if (error instanceof ContentFetchError) {
          logger.warn({ error, pageNum, maxPage }, 'Failed to fetch page');
        } else {
          logger.error({ error, pageNum, maxPage }, 'Unexpected error fetching page');
        }
        // Continue with other pages even if one fails
      }
    }

    // Combine all content
    const combinedContent = allContentParts.join('\n\n');
    logger.info(
      {
        url: baseUrl,
        pageCount: allContentParts.length,
        contentLength: combinedContent.length,
      },
      'Combined pages'
    );

    return combinedContent;
  }

  /**
   * Extract all page numbers from pagination in the HTML.
   */
  private extractPageNumbers(html: string): Set<number> {
    const $ = cheerio.load(html);
    const pageNumbers = new Set<number>([1]); // Always include page 1

    // Look for pagination container (WordPress standard)
    let pagination = $('nav.navigation.pagination').first();
    if (pagination.length === 0) {
      // Fallback: look for ul.page-numbers
      pagination = $('ul.page-numbers').first();
    }
    if (pagination.length === 0) {
      // Fallback: search in entire document
      pagination = $('body');
    }

    // Look for page number links
    // WordPress typically uses a.page-numbers or a.post-page-numbers
    pagination.find('a.page-numbers, a.post-page-numbers').each((_, el) => {
      const $link = $(el);
      // Try to get page number from link text
      const text = $link.text().trim();
      if (/^\d+$/.test(text)) {
        pageNumbers.add(parseInt(text, 10));
        logger.debug({ pageNumber: text }, 'Found page number from link text');
      }

      // Also try to extract from URL
      const href = $link.attr('href') || '';
      if (href) {
        // Try pattern: /article-name/2/ or /article-name/2
        const match = href.match(/\/(\d+)\/?$/);
        if (match) {
          pageNumbers.add(parseInt(match[1], 10));
          logger.debug({ pageNumber: match[1], href }, 'Found page number from URL');
        }
      }
    });

    // Also check for span.page-numbers (current page indicator)
    pagination.find('span.page-numbers, span.current').each((_, el) => {
      const $span = $(el);
      const text = $span.text().trim();
      if (/^\d+$/.test(text)) {
        pageNumbers.add(parseInt(text, 10));
        logger.debug({ pageNumber: text }, 'Found current page number from span');
      }
    });

    logger.info(
      { pageNumbers: Array.from(pageNumbers).sort((a, b) => a - b) },
      'Extracted page numbers'
    );
    return pageNumbers;
  }

  /**
   * Extract header image with width="16" and height="9".
   */
  private getHeaderImageUrl(html: string, article: RawArticle): string | undefined {
    const $ = cheerio.load(html);

    // First, look for image with width="16" and height="9"
    const headerImg = $('img[width="16"][height="9"]').first();
    if (headerImg.length > 0) {
      const src = headerImg.attr('src');
      if (src) {
        logger.info({ url: src }, 'Found header image (16x9)');
        return src;
      }
    }

    // Fallback: Look for the header div
    const headerDiv = $('div#gp-page-header-inner').first();
    if (headerDiv.length > 0) {
      const headerImg = headerDiv.find('img').first();
      if (headerImg.length > 0) {
        const src = headerImg.attr('src');
        if (src) {
          logger.info({ url: src }, 'Found header image');
          return src;
        }
      }
    }

    return undefined; // Fall back to automatic detection
  }

  /**
   * Extract and clean article content from a Mein-MMO page.
   */
  private async extractContent(
    html: string,
    article: RawArticle,
    isMultiPage: boolean = false
  ): Promise<string> {
    const $ = cheerio.load(html);

    // For multi-page articles, the HTML already contains combined content divs
    // For single-page articles, we need to extract the content first
    if (!isMultiPage) {
      // Extract content using base extractContent function
      const extracted = extractContent(html, {
        selectorsToRemove: this.selectorsToRemove,
        contentSelector: 'div.gp-entry-content',
      });
      // Reload with extracted content
      $.root().html(extracted);
    } else {
      // For multi-page, remove unwanted elements from the combined HTML
      for (const selector of this.selectorsToRemove) {
        $(selector).remove();
      }
    }

    // Handle multi-page articles: find ALL content divs, not just the first one
    const contentDivs = $('div.gp-entry-content');
    if (contentDivs.length === 0) {
      logger.warn({ url: article.url }, 'Could not find article content');
      // Fallback: return the HTML as-is
      return isMultiPage ? html : $.html();
    }

    // If multi-page, we'll have multiple divs - wrap them in a container
    let content: cheerio.Cheerio<AnyNode>;
    if (contentDivs.length > 1) {
      logger.info({ pageCount: contentDivs.length }, 'Processing multi-page article');
      // Create a wrapper div to contain all pages
      const wrapper = $('<div class="gp-entry-content"></div>');
      contentDivs.each((_, div) => {
        // Move all children from each page div into the wrapper
        $(div)
          .children()
          .each((_, child) => {
            wrapper.append(child);
          });
      });
      content = wrapper;
    } else {
      content = contentDivs.first();
    }

    // Convert embed consent placeholders to direct links
    content.find('figure').each((_, figureEl) => {
      const $figure = $(figureEl);

      // Check if this is a YouTube embed placeholder
      let youtubeLink: string | undefined;
      const youtubeLinks = $figure.find('a[href]').filter((_, linkEl) => {
        const href = $(linkEl).attr('href') || '';
        return href.includes('youtube.com') || href.includes('youtu.be');
      });
      if (youtubeLinks.length > 0) {
        youtubeLink = $(youtubeLinks[0]).attr('href') || undefined;
      }

      // Check if this is a Twitter/X embed placeholder
      let twitterLink: string | undefined;
      if (!youtubeLink) {
        const twitterLinks = $figure.find('a[href]').filter((_, linkEl) => {
          const href = $(linkEl).attr('href') || '';
          return href.includes('twitter.com') || href.includes('x.com');
        });
        if (twitterLinks.length > 0) {
          twitterLink = $(twitterLinks[0]).attr('href') || undefined;
        }
      }

      if (youtubeLink) {
        // Extract YouTube URL (clean up tracking parameters)
        let cleanUrl = youtubeLink;
        if (cleanUrl.includes('?') && !cleanUrl.includes('youtube.com/watch')) {
          cleanUrl = cleanUrl.split('?')[0];
        }

        // Replace figure with simple link
        // The standardizeContentFormat() will extract thumbnail and format it
        const newP = $('<p></p>');
        const newLink = $('<a></a>')
          .attr('href', cleanUrl)
          .attr('target', '_blank')
          .attr('rel', 'noopener')
          .text('Watch on YouTube');
        newP.append(newLink);

        $figure.replaceWith(newP);
        logger.debug({ url: cleanUrl }, 'Converted YouTube embed to link');
      } else if (twitterLink) {
        // Extract tweet URL (clean up tracking parameters)
        let cleanUrl = twitterLink;
        if (cleanUrl.includes('?')) {
          cleanUrl = cleanUrl.split('?')[0];
        }

        // Get caption text if available
        const figcaption = $figure.find('figcaption');
        const captionText = figcaption.length > 0 ? figcaption.text().trim() : '';

        // Replace figure with clean link
        const newP = $('<p></p>');
        const newLink = $('<a></a>')
          .attr('href', cleanUrl)
          .attr('target', '_blank')
          .attr('rel', 'noopener')
          .text(`View on X/Twitter: ${cleanUrl}`);
        newP.append(newLink);

        if (captionText) {
          newP.append('<br>');
          const captionSpan = $('<em></em>').text(captionText);
          newP.append(captionSpan);
        }

        $figure.replaceWith(newP);
        logger.debug({ url: cleanUrl }, 'Converted Twitter/X embed to link');
      }
    });

    // Standardize Reddit embeds (separate loop as they have different structure)
    content.find('figure').each((_, figureEl) => {
      const $figure = $(figureEl);

      // Check if this is a Reddit embed by looking for provider-reddit class
      const sanitizedClass = $figure.attr('data-sanitized-class') || '';
      if (sanitizedClass.includes('provider-reddit') || sanitizedClass.includes('embed-reddit')) {
        // Extract Reddit URL from the embed
        let redditLink: string | undefined;
        const redditLinks = $figure.find('a[href]').filter((_, linkEl) => {
          const href = $(linkEl).attr('href') || '';
          return href.includes('reddit.com');
        });
        if (redditLinks.length > 0) {
          redditLink = $(redditLinks[0]).attr('href') || undefined;
        }

        if (redditLink) {
          // Clean up tracking parameters
          let cleanUrl = redditLink;
          if (cleanUrl.includes('?')) {
            cleanUrl = cleanUrl.split('?')[0];
          }

          // Replace figure with simple link
          // The standardizeContentFormat() will extract thumbnail and format it
          const newP = $('<p></p>');
          const newLink = $('<a></a>')
            .attr('href', cleanUrl)
            .attr('target', '_blank')
            .attr('rel', 'noopener')
            .text('View on Reddit');
          newP.append(newLink);

          $figure.replaceWith(newP);
          logger.debug({ url: cleanUrl }, 'Converted Reddit embed to link');
        }
      }
    });

    // Remove empty elements
    content.find('p, div').each((_, el) => {
      const $el = $(el);
      if (!$el.text().trim() && $el.find('img').length === 0) {
        $el.remove();
      }
    });

    // Clean data attributes (except data-src and data-srcset)
    content.find('*').each((_, el) => {
      const $el = $(el);
      const attrs = $el.get(0)?.attribs || {};
      for (const attrName of Object.keys(attrs)) {
        if (attrName.startsWith('data-') && attrName !== 'data-src' && attrName !== 'data-srcset') {
          $el.removeAttr(attrName);
        }
      }
    });

    return content.html() || '';
  }
}
