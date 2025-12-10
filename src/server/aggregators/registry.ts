/**
 * Aggregator registry.
 *
 * Discovers and manages all available aggregators.
 */

import type { AggregatorMetadata } from "./base/types";
import { BaseAggregator } from "./base/aggregator";
import { logger } from "../utils/logger";

/**
 * Map aggregator ID to feed type.
 */
function getFeedTypeForAggregator(
  id: string,
): "article" | "youtube" | "podcast" | "reddit" {
  if (id === "youtube") return "youtube";
  if (id === "podcast") return "podcast";
  if (id === "reddit") return "reddit";
  return "article";
}

/**
 * Get icon URL for aggregator - uses aggregator-specific logos when available,
 * falls back to feed type icons.
 */
function getIconForAggregator(
  id: string,
  feedType: "article" | "youtube" | "podcast" | "reddit",
): string {
  // Aggregator-specific logo mapping
  const aggregatorIconMap: Record<string, string> = {
    // Social aggregators
    youtube: "/assets/icons/feed-youtube.svg",
    reddit: "/assets/icons/feed-reddit.svg",
    podcast: "/assets/icons/feed-podcast.svg",

    // Managed aggregators - use high-resolution local logos
    heise: "/assets/icons/heise-128.png",
    merkur: "/assets/icons/merkur-128.png",
    tagesschau: "/assets/icons/tagesschau-128.png",
    explosm: "/assets/icons/explosm-128.png",
    mactechnews: "/assets/icons/mactechnews-128.png",
    caschys_blog: "/assets/icons/caschys_blog-128.png",
    dark_legacy: "/assets/icons/dark_legacy-128.png",
    oglaf: "/assets/icons/oglaf.jpg",
    mein_mmo: "/assets/icons/mein-mmo-128.png",

    // Custom aggregators - use feed type icon
    full_website: "/assets/icons/feed-article.svg",
    feed_content: "/assets/icons/feed-article.svg",
  };

  // Return aggregator-specific icon if available, otherwise use feed type icon
  if (aggregatorIconMap[id]) {
    return aggregatorIconMap[id];
  }

  // Fallback to feed type icons
  const feedTypeIconMap: Record<string, string> = {
    article: "/assets/icons/feed-article.svg",
    youtube: "/assets/icons/feed-youtube.svg",
    podcast: "/assets/icons/feed-podcast.svg",
    reddit: "/assets/icons/feed-reddit.svg",
  };

  return feedTypeIconMap[feedType] || feedTypeIconMap["article"];
}

// Import aggregators
import { FullWebsiteAggregator } from "./full_website";
import { HeiseAggregator } from "./heise";
import { MerkurAggregator } from "./merkur";
import { YouTubeAggregator } from "./youtube";
import { RedditAggregator } from "./reddit";
import { PodcastAggregator } from "./podcast";
import { TagesschauAggregator } from "./tagesschau";
import { ExplosmAggregator } from "./explosm";
import { MacTechNewsAggregator } from "./mactechnews";
import { CaschysBlogAggregator } from "./caschys_blog";
import { DarkLegacyAggregator } from "./dark_legacy";
import { OglafAggregator } from "./oglaf";
import { MeinMmoAggregator } from "./mein_mmo";
import { FeedContentAggregator } from "./feed_content";

// Registry of all aggregators
const aggregatorClasses = new Map<string, new () => BaseAggregator>([
  ["full_website", FullWebsiteAggregator],
  ["heise", HeiseAggregator],
  ["merkur", MerkurAggregator],
  ["youtube", YouTubeAggregator],
  ["reddit", RedditAggregator],
  ["podcast", PodcastAggregator],
  ["tagesschau", TagesschauAggregator],
  ["explosm", ExplosmAggregator],
  ["dark_legacy", DarkLegacyAggregator],
  ["caschys_blog", CaschysBlogAggregator],
  ["mactechnews", MacTechNewsAggregator],
  ["oglaf", OglafAggregator],
  ["mein_mmo", MeinMmoAggregator],
  ["feed_content", FeedContentAggregator],
]);

/**
 * Get aggregator metadata.
 */
export function getAggregatorMetadata(id: string): AggregatorMetadata | null {
  const AggregatorClass = aggregatorClasses.get(id);
  if (!AggregatorClass) return null;

  try {
    const instance = new AggregatorClass();
    const feedType = getFeedTypeForAggregator(id);
    const icon = getIconForAggregator(id, feedType);

    return {
      id: instance.id,
      type: instance.type,
      name: instance.name,
      url: instance.url,
      description: instance.description,
      identifierType: instance.identifierType,
      identifierLabel: instance.identifierLabel,
      identifierDescription: instance.identifierDescription,
      identifierPlaceholder: instance.identifierPlaceholder,
      identifierChoices: instance.identifierChoices,
      identifierEditable: instance.identifierEditable,
      feedType,
      icon,
      prefillName: instance.prefillName,
      defaultDailyLimit: instance.defaultDailyLimit,
    };
  } catch (error) {
    logger.error(
      { error, aggregatorId: id },
      "Failed to get aggregator metadata",
    );
    return null;
  }
}

/**
 * Get all aggregators.
 *
 * Note: This returns all aggregators without filtering based on user settings.
 * User-specific filtering should be done in the service/router layer.
 */
export function getAllAggregators(): AggregatorMetadata[] {
  const aggregators: AggregatorMetadata[] = [];

  for (const id of aggregatorClasses.keys()) {
    const metadata = getAggregatorMetadata(id);
    if (metadata) {
      aggregators.push(metadata);
    }
  }

  // Sort: managed first, then social, then custom
  const typeOrder = { managed: 0, social: 1, custom: 2 };
  aggregators.sort((a, b) => {
    const aOrder = typeOrder[a.type] ?? 99;
    const bOrder = typeOrder[b.type] ?? 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });

  return aggregators;
}

/**
 * Get aggregator instance by ID.
 */
export function getAggregatorById(id: string): BaseAggregator | null {
  const AggregatorClass = aggregatorClasses.get(id);
  if (!AggregatorClass) {
    logger.warn({ aggregatorId: id }, "Aggregator not found");
    return null;
  }

  try {
    return new AggregatorClass();
  } catch (error) {
    logger.error(
      { error, aggregatorId: id },
      "Failed to create aggregator instance",
    );
    return null;
  }
}
