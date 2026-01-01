/**
 * Merkur aggregator.
 *
 * Specialized aggregator for Merkur.de (German news).
 */

import * as cheerio from "cheerio";

import { extractContent } from "./base/extract";
import type { RawArticle } from "./base/types";
import { sanitizeHtml } from "./base/utils";
import { FullWebsiteAggregator } from "./full_website";

export class MerkurAggregator extends FullWebsiteAggregator {
  override readonly id = "merkur";
  override readonly type: "managed" | "custom" | "social" = "managed";
  override readonly name = "Merkur";
  override readonly url = "https://www.merkur.de/rssfeed.rdf";
  override readonly description =
    "Merkur.de - German news website covering regional and national news.";
  override readonly prefillName = true;
  override readonly identifierEditable = false;

  override readonly identifierType = "url";
  override readonly identifierLabel = "Feed Selection";
  override readonly identifierDescription =
    "Select the Merkur feed to aggregate";
  override readonly identifierPlaceholder = "";
  override readonly identifierChoices: Array<[string, string]> = [
    ["https://www.merkur.de/rssfeed.rdf", "Main Feed"],
    [
      "https://www.merkur.de/lokales/garmisch-partenkirchen/rssfeed.rdf",
      "Garmisch-Partenkirchen",
    ],
    ["https://www.merkur.de/lokales/wuermtal/rssfeed.rdf", "Würmtal"],
    ["https://www.merkur.de/lokales/starnberg/rssfeed.rdf", "Starnberg"],
    [
      "https://www.merkur.de/lokales/fuerstenfeldbruck/rssfeed.rdf",
      "Fürstenfeldbruck",
    ],
    ["https://www.merkur.de/lokales/dachau/rssfeed.rdf", "Dachau"],
    ["https://www.merkur.de/lokales/freising/rssfeed.rdf", "Freising"],
    ["https://www.merkur.de/lokales/erding/rssfeed.rdf", "Erding"],
    ["https://www.merkur.de/lokales/ebersberg/rssfeed.rdf", "Ebersberg"],
    ["https://www.merkur.de/lokales/muenchen/rssfeed.rdf", "München"],
    [
      "https://www.merkur.de/lokales/muenchen-lk/rssfeed.rdf",
      "München Landkreis",
    ],
    ["https://www.merkur.de/lokales/holzkirchen/rssfeed.rdf", "Holzkirchen"],
    ["https://www.merkur.de/lokales/miesbach/rssfeed.rdf", "Miesbach"],
    [
      "https://www.merkur.de/lokales/region-tegernsee/rssfeed.rdf",
      "Region Tegernsee",
    ],
    ["https://www.merkur.de/lokales/bad-toelz/rssfeed.rdf", "Bad Tölz"],
    [
      "https://www.merkur.de/lokales/wolfratshausen/rssfeed.rdf",
      "Wolfratshausen",
    ],
    ["https://www.merkur.de/lokales/weilheim/rssfeed.rdf", "Weilheim"],
    ["https://www.merkur.de/lokales/schongau/rssfeed.rdf", "Schongau"],
  ];

  override readonly waitForSelector = ".idjs-Story";

  override readonly selectorsToRemove = [
    ".id-DonaldBreadcrumb--default",
    ".id-StoryElement-headline",
    ".lp_west_printAction",
    ".lp_west_webshareAction",
    ".id-Recommendation",
    ".enclosure",
    ".id-Story-timestamp",
    ".id-Story-authors",
    ".id-Story-interactionBar",
    ".id-Comments",
    ".id-ClsPrevention",
    "egy-discussion",
    "figcaption",
    "script",
    "style",
    "iframe",
    "noscript",
    "svg",
    ".id-StoryElement-intestitialLink",
    ".id-StoryElement-embed--fanq",
  ];

  /**
   * Override extractContent to use .idjs-Story selector.
   */
  protected override async extractContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "extractContent",
        subStep: "extractIdjsStory",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
      },
      "Extracting content from .idjs-Story element",
    );

    const extracted = extractContent(html, {
      selectorsToRemove: this.selectorsToRemove,
      contentSelector: ".idjs-Story",
    });

    if (!extracted || extracted.trim().length === 0) {
      this.logger.warn(
        {
          step: "extractContent",
          subStep: "extractIdjsStory",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
        },
        "Could not find .idjs-Story content, using base extraction",
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
        subStep: "extractIdjsStory",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
        elapsed,
      },
      "Content extracted from .idjs-Story",
    );

    return result;
  }

  /**
   * Override processContent to apply Merkur-specific cleanup.
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
      "Processing Merkur content with custom cleanup",
    );

    // Process content with Merkur-specific cleanup
    const $ = cheerio.load(html);

    // Remove empty tags (p, div, span) that have no text and no images
    $("p, div, span").each((_, el) => {
      const $el = $(el);
      if (!$el.text().trim() && !$el.find("img").length) {
        $el.remove();
      }
    });

    let content = $.html() || "";

    // Sanitize HTML (remove scripts, rename attributes)
    // This creates data-sanitized-* attributes
    content = sanitizeHtml(content);

    // Remove all data-sanitized-* attributes after sanitization (as per legacy behavior)
    // The legacy Python code removes these attributes to clean up the HTML
    const $sanitized = cheerio.load(content);
    $sanitized("*").each((_, el) => {
      const $el = $sanitized(el);
      if ("attribs" in el && el.attribs) {
        const attrs = el.attribs;
        const attrsToRemove: string[] = [];
        for (const attr of Object.keys(attrs)) {
          if (attr.startsWith("data-sanitized-")) {
            attrsToRemove.push(attr);
          }
        }
        for (const attr of attrsToRemove) {
          $el.removeAttr(attr);
        }
      }
    });
    content = $sanitized.html() || "";

    // Use base processContent for standardization
    const result = await super.processContent(content, article);

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
      "Merkur content processed",
    );

    return result;
  }
}
