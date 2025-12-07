/**
 * Heise aggregator.
 *
 * Specialized aggregator for Heise.de (German tech news).
 */

import { FullWebsiteAggregator } from './full_website';
import type { RawArticle } from './base/types';
import { fetchArticleContent } from './base/fetch';
import { extractContent } from './base/extract';
import { standardizeContentFormat } from './base/process';
import { sanitizeHtml } from './base/utils';
import { logger } from '../utils/logger';
import * as cheerio from 'cheerio';
import { ContentFetchError } from './base/exceptions';

export class HeiseAggregator extends FullWebsiteAggregator {
  override readonly id = 'heise';
  override readonly type: 'managed' | 'custom' | 'social' = 'managed';
  override readonly name = 'Heise';
  override readonly url = 'https://www.heise.de/rss/heise.rdf';
  override readonly description =
    'Heise.de - German technology news website covering IT, science, and digital culture.';

  override readonly waitForSelector = '#meldung, .StoryContent';
  override readonly selectorsToRemove = [
    '.ad-label',
    '.ad',
    '.article-sidebar',
    'section',
    "a[name='meldung.ho.bottom.zurstartseite']",
    'a-img',
    '.a-article-header__lead',
    '.a-article-header__title',
    '.a-article-header__publish-info',
    '.a-article-header__service',
    "div[data-component='RecommendationBox']",
    '.opt-in__content-container',
    '.a-box',
    'iframe',
    '.a-u-inline',
    '.redakteurskuerzel',
    '.branding',
    'a-gift',
    'aside',
    'script',
    'style',
    'noscript',
    'footer',
    '.rte__list',
    '#wtma_teaser_ho_vertrieb_inline_branding',
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
    // Heise-specific options
    traverse_multipage: {
      type: 'boolean' as const,
      label: 'Traverse multi-page articles',
      helpText: 'Fetch and inline all pages of multi-page articles into a single article',
      default: false,
      required: false,
    },
    max_comments: {
      type: 'integer' as const,
      label: 'Maximum comments to extract',
      helpText: 'Number of comments to extract and inline at the end of articles (0 to disable)',
      default: 0,
      required: false,
      min: 0,
      max: 100,
    },
  };

  protected override shouldSkipArticle(article: RawArticle): boolean {
    const skipTerms = [
      'die Bilder der Woche',
      'Produktwerker',
      'heise-Angebot',
      '#TGIQF',
      'heise+',
      '#heiseshow:',
      'Mein Scrum ist kaputt',
      'software-architektur.tv',
      'Developer Snapshots',
    ];

    if (skipTerms.some(term => article.title.includes(term))) {
      logger.info({ title: article.title }, 'Skipping filtered content');
      return true;
    }

    return super.shouldSkipArticle(article);
  }

  override async aggregate(articleLimit?: number): Promise<RawArticle[]> {
    if (!this.feed) {
      throw new Error('Feed not initialized');
    }

    // Get options
    const traverseMultipage = this.getOption('traverse_multipage', false) as boolean;
    const maxComments = this.getOption('max_comments', 0) as number;

    // Call parent aggregate to get base articles
    const articles = await super.aggregate(articleLimit);

    // Process each article with Heise-specific logic
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

        // Convert to all-pages URL if option enabled
        let articleUrl = article.url;
        if (traverseMultipage) {
          try {
            const url = new URL(articleUrl);
            url.searchParams.set('seite', 'all');
            articleUrl = url.toString();
            logger.info({ url: articleUrl }, 'Using all-pages URL');
          } catch (error) {
            logger.warn({ error, url: article.url }, 'Failed to convert to all-pages URL');
          }
        }

        // Fetch article HTML
        const html = await fetchArticleContent(articleUrl, {
          timeout: this.fetchTimeout,
          waitForSelector: this.waitForSelector,
        });

        // Extract content
        const extracted = extractContent(html, {
          selectorsToRemove: this.selectorsToRemove,
          contentSelector: '#meldung, .StoryContent',
        });

        // Process content
        const $ = cheerio.load(extracted);

        // Remove empty elements
        $('p, div, span').each((_, el) => {
          const $el = $(el);
          if (!$el.text().trim() && !$el.find('img').length) {
            $el.remove();
          }
        });

        let content = $.html();

        // Sanitize HTML (remove scripts, rename attributes)
        content = sanitizeHtml(content);

        // Add comments if enabled
        if (maxComments > 0) {
          try {
            logger.info({ url: articleUrl, maxComments }, 'Extracting comments');
            const commentsHtml = await this.extractComments(articleUrl, html, maxComments);
            if (commentsHtml) {
              content = `${content}\n\n${commentsHtml}`;
            }
          } catch (error) {
            logger.warn({ error, url: articleUrl }, 'Failed to extract comments');
            // Comments are optional, continue without them
          }
        }

        // Standardize format (add header image, source link)
        const generateTitleImage = this.feed?.generateTitleImage ?? true;
        const addSourceFooter = this.feed?.addSourceFooter ?? true;
        article.content = await standardizeContentFormat(
          content,
          article,
          article.url,
          generateTitleImage,
          addSourceFooter
        );
      } catch (error) {
        logger.error({ error, url: article.url }, 'Error processing Heise article');
        // Continue with original content if processing fails
      }
    }

    return articles;
  }

  /**
   * Extract comments from a Heise article.
   */
  private async extractComments(
    articleUrl: string,
    articleHtml: string,
    maxComments: number
  ): Promise<string | null> {
    // Extract forum URL from article HTML
    const forumUrl = this.extractForumUrl(articleHtml, articleUrl);
    if (!forumUrl) {
      logger.info({ url: articleUrl }, 'No forum URL found in article');
      return null;
    }

    logger.info({ forumUrl }, 'Fetching comments from forum');

    try {
      // Fetch the forum page
      const html = await fetchArticleContent(forumUrl, {
        timeout: 30000,
        waitForSelector: 'body',
      });

      const $ = cheerio.load(html);

      // Try different comment selectors
      const commentSelectors = ['li.posting_element', '[id^="posting_"]', '.posting', '.a-comment'];

      let commentElements: cheerio.Cheerio<any> | null = null;
      for (const selector of commentSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          logger.info({ selector, count: elements.length }, 'Found comments using selector');
          commentElements = elements;
          break;
        }
      }

      if (!commentElements || commentElements.length === 0) {
        logger.info({ forumUrl }, 'No comments found in forum HTML');
        return null;
      }

      // Extract and format comments
      const commentHtmlParts: string[] = [`<h3><a href="${forumUrl}">Comments</a></h3>`];
      let extractedCount = 0;

      commentElements.slice(0, maxComments).each((i, element) => {
        try {
          const $el = $(element);
          let author = 'Unknown';
          const isListItem = element.tagName === 'li';

          if (isListItem) {
            // Extract from list view
            const authorElem = $el.find('.tree_thread_list--written_by_user, .pseudonym').first();
            if (authorElem.length) {
              author = authorElem.text().trim();
            }

            const titleLink = $el.find('a.posting_subject').first();
            if (!titleLink.length) {
              return;
            }

            const title = titleLink.text().trim();
            const content = `<p>${cheerio.load(title).text()}</p>`;
            const commentUrl = titleLink.attr('href') || '';

            commentHtmlParts.push(
              `<blockquote><p><strong>${author}</strong> | <a href="${commentUrl}">source</a></p><div>${content}</div></blockquote>`
            );
            extractedCount++;
          } else {
            // Extract from full posting view
            const authorSelectors = [
              'a[href*="/forum/heise-online/Meinungen"]',
              '.pseudonym',
              '.username',
              'strong',
            ];

            for (const selector of authorSelectors) {
              const authorElem = $el.find(selector).first();
              if (authorElem.length) {
                const authorText = authorElem.text().trim();
                if (authorText && authorText.length < 50) {
                  author = authorText;
                  break;
                }
              }
            }

            // Extract content
            const contentSelectors = ['.text', '.posting-content', '.comment-body', 'p'];
            let content = '';
            for (const selector of contentSelectors) {
              const contentElem = $el.find(selector).first();
              if (contentElem.length) {
                content = contentElem.html() || '';
                break;
              }
            }

            const commentId = $el.attr('id') || `comment-${i}`;
            const commentUrl = `${articleUrl}#${commentId}`;

            if (!content || !content.trim()) {
              return;
            }

            commentHtmlParts.push(
              `<blockquote><p><strong>${author}</strong> | <a href="${commentUrl}">source</a></p><div>${content}</div></blockquote>`
            );
            extractedCount++;
          }
        } catch (error) {
          logger.warn({ error, index: i }, 'Error extracting comment');
        }
      });

      if (extractedCount === 0) {
        return null;
      }

      logger.info({ extractedCount }, 'Successfully extracted comments');
      return commentHtmlParts.join('\n');
    } catch (error) {
      if (error instanceof ContentFetchError) {
        logger.warn({ error, forumUrl }, 'Failed to fetch comments');
      } else {
        logger.warn({ error, forumUrl }, 'Unexpected error fetching comments');
      }
      return null;
    }
  }

  /**
   * Extract the forum URL from article HTML.
   */
  private extractForumUrl(articleHtml: string, articleUrl: string): string | null {
    const $ = cheerio.load(articleHtml);

    // Look for JSON-LD script tag
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).text();
        const data = JSON.parse(text);
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (item.discussionUrl) {
            let discussionUrl = item.discussionUrl;
            if (discussionUrl.startsWith('/')) {
              const url = new URL(articleUrl);
              discussionUrl = `${url.origin}${discussionUrl}`;
            }
            return discussionUrl;
          }
        }
      } catch {
        // Invalid JSON, skip
      }
    });

    // Fallback: look for comment links in HTML
    const commentLink = $('a[href*="/forum/"][href*="comment"]').first();
    if (commentLink.length) {
      let href = commentLink.attr('href') || '';
      if (href.startsWith('/')) {
        const url = new URL(articleUrl);
        href = `${url.origin}${href}`;
      }
      return href;
    }

    return null;
  }
}
