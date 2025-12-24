/**
 * Caschys Blog aggregator.
 *
 * Specialized aggregator for Caschys Blog (German tech blog).
 */

import { logger } from "../utils/logger";

import { extractContent } from "./base/extract";
import type { RawArticle } from "./base/types";
import { FullWebsiteAggregator } from "./full_website";

export class CaschysBlogAggregator extends FullWebsiteAggregator {
  override readonly id = "caschys_blog";
  override readonly type: "managed" | "custom" | "social" = "managed";
  override readonly name = "Caschys Blog";
  override readonly url = "https://stadt-bremerhaven.de/feed/";
  override readonly description =
    "Caschys Blog - German technology blog covering tech news and reviews.";
  override readonly prefillName = true;

  override readonly waitForSelector = ".entry-inner";
  override readonly selectorsToRemove = [
    ".aawp",
    ".aawp-disclaimer",
    "script",
    "style",
    "iframe",
    "noscript",
    "svg",
  ];

  override readonly identifierEditable = false;

  protected override shouldSkipArticle(article: RawArticle): boolean {
    // Skip articles marked as advertisements (Anzeige)
    if (article.title.includes("(Anzeige)")) {
      logger.info({ title: article.title }, "Skipping advertisement");
      return true;
    }

    return super.shouldSkipArticle(article);
  }

  /**
   * Override extractContent to use .entry-inner selector.
   */
  protected override async extractContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "extractContent",
        subStep: "extractEntryInner",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
      },
      "Extracting content from .entry-inner element",
    );

    const extracted = extractContent(html, {
      selectorsToRemove: this.selectorsToRemove,
      contentSelector: ".entry-inner",
    });

    if (!extracted || extracted.trim().length === 0) {
      this.logger.warn(
        {
          step: "extractContent",
          subStep: "extractEntryInner",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
        },
        "Could not find .entry-inner content, using base extraction",
      );
      // Fallback to base extraction
      return await super.extractContent(html, article);
    }

    // Use base removeElementsBySelectors for additional cleanup
    const result = await super.removeElementsBySelectors(extracted, article);

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      {
        step: "extractContent",
        subStep: "extractEntryInner",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
        elapsed,
      },
      "Content extracted from .entry-inner",
    );

    return result;
  }
}
