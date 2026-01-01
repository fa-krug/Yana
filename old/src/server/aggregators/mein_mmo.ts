/**
 * Mein-MMO aggregator.
 *
 * Specialized aggregator for Mein-MMO.de (German gaming news).
 */

import type { RawArticle } from "./base/types";
import { FullWebsiteAggregator } from "./full_website";
import { extractMeinMmoContent } from "./mein_mmo/extraction";
import { fetchAllPages } from "./mein_mmo/fetching";
import { getHeaderImageUrl } from "./mein_mmo/utils";

export class MeinMmoAggregator extends FullWebsiteAggregator {
  override readonly id = "mein_mmo";
  override readonly type: "managed" | "custom" | "social" = "managed";
  override readonly name = "Mein-MMO";
  override readonly url = "https://mein-mmo.de/feed/";
  override readonly description =
    "Mein-MMO.de - German gaming news website covering MMO and online gaming topics.";
  override readonly prefillName = true;
  override readonly identifierEditable = false;

  override readonly waitForSelector = "div.gp-entry-content";
  override readonly selectorsToRemove = [
    "div.wp-block-mmo-video",
    "div.wp-block-mmo-recirculation-box",
    "div.reading-position-indicator-end",
    "label.toggle",
    "a.wp-block-mmo-content-box",
    "ul.page-numbers",
    ".post-page-numbers",
    "#ftwp-container-outer",
    "script",
    "style",
    "iframe",
    "noscript",
  ];

  override readonly options = {
    // Inherit options from FullWebsiteAggregator
    exclude_selectors: {
      type: "string" as const,
      label: "CSS selectors to exclude (one per line)",
      helpText:
        "Additional CSS selectors for elements to remove from content. Enter one selector per line.\n\nExample:\n.advertisement\n.social-share\nfooter\nscript",
      default: "",
      required: false,
      widget: "textarea" as const,
    },
    ignore_title_contains: {
      type: "string" as const,
      label: "Ignore articles if title contains (one per line)",
      helpText:
        "Skip articles if the title contains any of these strings (case-insensitive). Enter one string per line.\n\nExample:\n[SPONSORED]\nAdvertisement\nPremium",
      default: "",
      required: false,
      widget: "textarea" as const,
    },
    ignore_content_contains: {
      type: "string" as const,
      label: "Ignore articles if content contains (one per line)",
      helpText:
        "Skip articles if the title or content contains any of these strings (case-insensitive). Enter one string per line.\n\nExample:\npaywall\nsubscription required\nmembers only",
      default: "",
      required: false,
      widget: "textarea" as const,
    },
    regex_replacements: {
      type: "string" as const,
      label: "Regex replacements (one per line)",
      helpText:
        "Apply regex replacements to article content. One replacement per line in format: pattern|replacement\n\nApplied sequentially after all other processing.\n\nExample:\nfoo|bar\n\\d{4}|YEAR\n^\\s+|  (remove leading spaces)\n\nNote: Use | to separate pattern from replacement. To include a literal |, escape it as \\|",
      default: "",
      required: false,
      widget: "textarea" as const,
    },
    // Mein-MMO-specific options
    traverse_multipage: {
      type: "boolean" as const,
      label: "Traverse multi-page articles",
      helpText:
        "Fetch and combine all pages of multi-page articles into a single article",
      default: false,
      required: false,
    },
  };

  /**
   * Override fetchArticleContentInternal to handle multi-page articles.
   */
  protected override async fetchArticleContentInternal(
    url: string,
    article: RawArticle,
  ): Promise<string> {
    const traverseMultipage = this.getOption(
      "traverse_multipage",
      false,
    ) as boolean;

    if (traverseMultipage) {
      this.logger.debug(
        {
          step: "enrichArticles",
          subStep: "fetchArticleContent",
          aggregator: this.id,
          feedId: this.feed?.id,
          url,
        },
        "Fetching multi-page article",
      );
      // fetchAllPages returns combined content divs, not full HTML
      // Store flag for extractContent to know it's multipage
      (article as RawArticle & { __isMultiPage?: boolean }).__isMultiPage =
        true;
      return await fetchAllPages(
        url,
        this.logger,
        this.id,
        this.feed?.id,
        async (url: string) => {
          return await super.fetchArticleContentInternal(url, article);
        },
      );
    }

    // Use base fetchArticleContentInternal for single-page
    const html = await super.fetchArticleContentInternal(url, article);

    // Check if article might be multi-page even if option is disabled
    // This is just for logging/debugging - we don't fetch all pages
    const { extractPageNumbers } = await import("./mein_mmo/fetching");
    const pageNumbers = extractPageNumbers(
      html,
      this.logger,
      this.id,
      this.feed?.id,
    );
    if (pageNumbers.size > 1) {
      this.logger.info(
        {
          step: "enrichArticles",
          subStep: "fetchArticleContent",
          aggregator: this.id,
          feedId: this.feed?.id,
          url,
          pageCount: pageNumbers.size,
          pages: Array.from(pageNumbers).sort((a, b) => a - b),
        },
        "Article appears to be multi-page, but traverse_multipage option is disabled. Enable 'Traverse multi-page articles' option to fetch all pages.",
      );
    }

    return html;
  }

  /**
   * Override extractContent to use Mein-MMO-specific extraction.
   */
  protected override async extractContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();
    const isMultiPage =
      (article as RawArticle & { __isMultiPage?: boolean }).__isMultiPage ||
      false;

    this.logger.debug(
      {
        step: "extractContent",
        subStep: "extractMeinMmo",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
        isMultiPage,
      },
      "Extracting Mein-MMO content",
    );

    // Use Mein-MMO-specific extraction
    const extracted = await extractMeinMmoContent(
      html,
      article,
      isMultiPage,
      this.selectorsToRemove,
      this.logger,
      this.id,
      this.feed?.id,
    );

    // Use base removeElementsBySelectors for additional cleanup
    const result = await super.removeElementsBySelectors(extracted, article);

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      {
        step: "extractContent",
        subStep: "extractMeinMmo",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
        elapsed,
      },
      "Mein-MMO content extracted",
    );

    return result;
  }

  /**
   * Override processContent to extract header image URL.
   */
  protected override async processContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "enrichArticles",
        subStep: "processContent",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
      },
      "Processing Mein-MMO content",
    );

    // Get header image URL
    // Need to fetch original HTML if we used multipage (fetchAllPages returns combined content)
    const traverseMultipage = this.getOption(
      "traverse_multipage",
      false,
    ) as boolean;
    let headerImageUrl: string | undefined;
    if (traverseMultipage) {
      // For multipage, fetch first page to get header image (use base method to avoid multipage)
      try {
        const firstPageHtml = await super.fetchArticleContentInternal(
          article.url,
          article,
        );
        headerImageUrl = getHeaderImageUrl(
          firstPageHtml,
          article,
          this.logger,
          this.id,
          this.feed?.id,
        );
      } catch (error) {
        this.logger.debug(
          {
            step: "enrichArticles",
            subStep: "processContent",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            error,
          },
          "Failed to fetch header image URL",
        );
      }
    } else {
      // For single page, we need to refetch to get header image
      // (html is already extracted content)
      try {
        const fullHtml = await super.fetchArticleContentInternal(
          article.url,
          article,
        );
        headerImageUrl = getHeaderImageUrl(
          fullHtml,
          article,
          this.logger,
          this.id,
          this.feed?.id,
        );
      } catch (error) {
        this.logger.debug(
          {
            step: "enrichArticles",
            subStep: "processContent",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            error,
          },
          "Failed to fetch header image URL",
        );
      }
    }

    // Use base processContent with header image URL
    const { processContent: processContentUtil } =
      await import("./base/process");
    const { sanitizeHtml } = await import("./base/utils");

    // Sanitize HTML
    const sanitized = sanitizeHtml(html);

    // Standardize format with header image
    const generateTitleImage = this.feed?.generateTitleImage ?? true;
    const addSourceFooter = this.feed?.addSourceFooter ?? true;
    const result = await processContentUtil(
      sanitized,
      article,
      generateTitleImage,
      addSourceFooter,
      headerImageUrl,
    );

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      {
        step: "enrichArticles",
        subStep: "processContent",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
        elapsed,
      },
      "Mein-MMO content processed",
    );

    return result;
  }
}
