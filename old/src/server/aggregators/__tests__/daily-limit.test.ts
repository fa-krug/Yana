/**
 * Integration tests for daily limit enforcement.
 *
 * These tests verify that the daily post limit is properly enforced
 * throughout the aggregation flow, including after filtering.
 */

import Parser from "rss-parser";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { testUser } from "../../../../tests/utils/fixtures";
import { setupTestDb, teardownTestDb } from "../../../../tests/utils/testDb";
import { db, articles, feeds } from "../../db";
import { createUser } from "../../services/user.service";
import type { RawArticle } from "../base/types";
import { FullWebsiteAggregator } from "../full_website";
import { RedditAggregator } from "../reddit";

// Mock logger
vi.mock("../../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
  createLogger: vi.fn((_context) => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock fetchFeed
vi.mock("../base/fetch", () => ({
  fetchFeed: vi.fn(),
  fetchArticleContent: vi.fn(),
}));

// Mock user settings service
vi.mock("../../services/userSettings.service", () => ({
  getUserSettings: vi.fn().mockResolvedValue({
    redditEnabled: true,
    redditClientId: "test_client_id",
    redditClientSecret: "test_client_secret",
    redditUserAgent: "test_user_agent",
  }),
}));

describe("Daily Limit Integration Tests", () => {
  let testUserId: number;

  beforeEach(async () => {
    setupTestDb();
    // Create a test user
    const user = await createUser(
      testUser.username,
      testUser.email,
      "password",
    );
    testUserId = user.id;
  });

  afterEach(() => {
    teardownTestDb();
  });

  describe("Full Aggregation Flow with Daily Limit", () => {
    it("should enforce daily limit after filtering", async () => {
      // Create feed with limit 5
      const [feed] = await db
        .insert(feeds)
        .values({
          userId: testUserId,
          name: "Test Feed",
          identifier: "https://example.com/feed.xml",
          aggregator: "full_website",
          feedType: "article",
          enabled: true,
          dailyPostLimit: 5,
          generateTitleImage: false,
          addSourceFooter: true,
          useCurrentTimestamp: false,
          aggregatorOptions: {},
        })
        .returning();

      // Create 3 articles already added today
      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);
      await db.insert(articles).values([
        {
          feedId: feed.id,
          name: "Article 1",
          url: "https://example.com/1",
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        },
        {
          feedId: feed.id,
          name: "Article 2",
          url: "https://example.com/2",
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        },
        {
          feedId: feed.id,
          name: "Article 3",
          url: "https://example.com/3",
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        },
      ]);

      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(feed, false, {});

      // Mock fetchSourceData to return feed with 10 items
      const mockFeedData: Parser.Output<unknown> = {
        items: Array.from({ length: 10 }, (_, i) => ({
          title: `Article ${i + 1}`,
          link: `https://example.com/article${i + 1}`,
          pubDate: new Date().toISOString(),
          contentSnippet: `Summary ${i + 1}`,
        })),
      };

      vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue(
        mockFeedData,
      );

      // Mock parseToRawArticles to return 10 articles
      const parsedArticles: RawArticle[] = Array.from(
        { length: 10 },
        (_, i) => ({
          title: `Article ${i + 1}`,
          url: `https://example.com/article${i + 1}`,
          published: new Date(),
          summary: `Summary ${i + 1}`,
        }),
      );

      vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue(
        parsedArticles,
      );

      // Mock enrichArticles to pass through articles
      vi.spyOn(aggregator as any, "enrichArticles").mockImplementation(
        async (articles: RawArticle[]) => articles,
      );

      // Mock finalizeArticles to pass through articles
      vi.spyOn(aggregator as any, "finalizeArticles").mockImplementation(
        async (articles: RawArticle[]) => articles,
      );

      // Don't mock filterArticles - let it run the real logic including applyArticleLimit
      // This is the key: we want to test the actual filtering flow

      // Run aggregation
      const result = await aggregator.aggregate();

      // Should only return 2 articles (5 limit - 3 already added = 2 remaining)
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("Article 1");
      expect(result[1].title).toBe("Article 2");
    });

    it("should return empty array when quota is exhausted", async () => {
      // Create feed with limit 5
      const [feed] = await db
        .insert(feeds)
        .values({
          userId: testUserId,
          name: "Test Feed",
          identifier: "https://example.com/feed.xml",
          aggregator: "full_website",
          feedType: "article",
          enabled: true,
          dailyPostLimit: 5,
          generateTitleImage: false,
          addSourceFooter: true,
          useCurrentTimestamp: false,
          aggregatorOptions: {},
        })
        .returning();

      // Create 5 articles already added today (quota exhausted)
      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);
      await db.insert(articles).values(
        Array.from({ length: 5 }, (_, i) => ({
          feedId: feed.id,
          name: `Article ${i + 1}`,
          url: `https://example.com/${i + 1}`,
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        })),
      );

      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(feed, false, {});

      // Mock fetchSourceData
      const mockFeedData: Parser.Output<unknown> = {
        items: [
          {
            title: "New Article",
            link: "https://example.com/new",
            pubDate: new Date().toISOString(),
            contentSnippet: "Summary",
          },
        ],
      };

      vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue(
        mockFeedData,
      );

      vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue([
        {
          title: "New Article",
          url: "https://example.com/new",
          published: new Date(),
          summary: "Summary",
        },
      ]);

      vi.spyOn(aggregator as any, "enrichArticles").mockImplementation(
        async (articles: RawArticle[]) => articles,
      );

      vi.spyOn(aggregator as any, "finalizeArticles").mockImplementation(
        async (articles: RawArticle[]) => articles,
      );

      // Run aggregation
      const result = await aggregator.aggregate();

      // Should return empty array (quota exhausted)
      expect(result).toHaveLength(0);
    });

    it("should respect daily limit across multiple aggregation runs", async () => {
      // Create feed with limit 10
      const [feed] = await db
        .insert(feeds)
        .values({
          userId: 1,
          name: "Test Feed",
          identifier: "https://example.com/feed.xml",
          aggregator: "full_website",
          feedType: "article",
          enabled: true,
          dailyPostLimit: 10,
          generateTitleImage: false,
          addSourceFooter: true,
          useCurrentTimestamp: false,
          aggregatorOptions: {},
        })
        .returning();

      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(feed, false, {});

      // First run: Create 5 articles
      const today = new Date();
      today.setUTCHours(10, 0, 0, 0);
      await db.insert(articles).values(
        Array.from({ length: 5 }, (_, i) => ({
          feedId: feed.id,
          name: `First Run Article ${i + 1}`,
          url: `https://example.com/first${i + 1}`,
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        })),
      );

      // Mock second run: fetch 10 articles
      const mockFeedData: Parser.Output<unknown> = {
        items: Array.from({ length: 10 }, (_, i) => ({
          title: `Second Run Article ${i + 1}`,
          link: `https://example.com/second${i + 1}`,
          pubDate: new Date().toISOString(),
          contentSnippet: `Summary ${i + 1}`,
        })),
      };

      vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue(
        mockFeedData,
      );

      const parsedArticles: RawArticle[] = Array.from(
        { length: 10 },
        (_, i) => ({
          title: `Second Run Article ${i + 1}`,
          url: `https://example.com/second${i + 1}`,
          published: new Date(),
          summary: `Summary ${i + 1}`,
        }),
      );

      vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue(
        parsedArticles,
      );

      vi.spyOn(aggregator as any, "enrichArticles").mockImplementation(
        async (articles: RawArticle[]) => articles,
      );

      vi.spyOn(aggregator as any, "finalizeArticles").mockImplementation(
        async (articles: RawArticle[]) => articles,
      );

      // Run second aggregation
      const result = await aggregator.aggregate();

      // Should only return 5 articles (10 limit - 5 already added = 5 remaining)
      expect(result).toHaveLength(5);
      expect(result[0].title).toBe("Second Run Article 1");
      expect(result[4].title).toBe("Second Run Article 5");
    });

    it("should handle case where more articles pass filtering than quota allows", async () => {
      // This is the specific bug scenario: fetch limit suggests 5 posts,
      // but after filtering, 8 articles remain, and we should only save 2
      // (if 8 were already added today with limit 10)

      const [feed] = await db
        .insert(feeds)
        .values({
          userId: 1,
          name: "Test Feed",
          identifier: "https://example.com/feed.xml",
          aggregator: "full_website",
          feedType: "article",
          enabled: true,
          dailyPostLimit: 10,
          generateTitleImage: false,
          addSourceFooter: true,
          useCurrentTimestamp: false,
          aggregatorOptions: {},
        })
        .returning();

      // Create 8 articles already added today
      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);
      await db.insert(articles).values(
        Array.from({ length: 8 }, (_, i) => ({
          feedId: feed.id,
          name: `Existing Article ${i + 1}`,
          url: `https://example.com/existing${i + 1}`,
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        })),
      );

      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(feed, false, {});

      // Mock fetchSourceData - getDynamicFetchLimit would suggest fetching ~2 posts
      // But we fetch more to account for filtering, say 10 posts
      const mockFeedData: Parser.Output<unknown> = {
        items: Array.from({ length: 10 }, (_, i) => ({
          title: `New Article ${i + 1}`,
          link: `https://example.com/new${i + 1}`,
          pubDate: new Date().toISOString(),
          contentSnippet: `Summary ${i + 1}`,
        })),
      };

      vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue(
        mockFeedData,
      );

      // After parsing, we have 10 articles
      // After filtering (shouldSkipArticle, etc.), 8 articles remain
      // But applyArticleLimit should limit to 2 (10 - 8 = 2 remaining)
      const parsedArticles: RawArticle[] = Array.from(
        { length: 10 },
        (_, i) => ({
          title: `New Article ${i + 1}`,
          url: `https://example.com/new${i + 1}`,
          published: new Date(),
          summary: `Summary ${i + 1}`,
        }),
      );

      vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue(
        parsedArticles,
      );

      // Mock filterArticles to simulate 8 articles passing filtering
      // But we want to test the real applyArticleLimit, so we'll mock
      // shouldSkipArticle to return false for 8 articles
      vi.spyOn(aggregator as any, "shouldSkipArticle").mockReturnValue(false);

      vi.spyOn(aggregator as any, "enrichArticles").mockImplementation(
        async (articles: RawArticle[]) => articles,
      );

      vi.spyOn(aggregator as any, "finalizeArticles").mockImplementation(
        async (articles: RawArticle[]) => articles,
      );

      // Run aggregation
      const result = await aggregator.aggregate();

      // Should only return 2 articles (10 limit - 8 already added = 2 remaining)
      // This is the key test: even though 8 articles passed filtering,
      // applyArticleLimit should enforce the daily limit
      expect(result).toHaveLength(2);
    });
  });

  describe("Reddit Aggregator Daily Limit", () => {
    it("should enforce daily limit for Reddit aggregator", async () => {
      const [feed] = await db
        .insert(feeds)
        .values({
          userId: 1,
          name: "Reddit Test Feed",
          identifier: "programming",
          aggregator: "reddit",
          feedType: "article",
          enabled: true,
          dailyPostLimit: 20, // Reddit default
          generateTitleImage: false,
          addSourceFooter: true,
          useCurrentTimestamp: false,
          aggregatorOptions: {},
        })
        .returning();

      // Create 15 articles already added today
      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);
      await db.insert(articles).values(
        Array.from({ length: 15 }, (_, i) => ({
          feedId: feed.id,
          name: `Reddit Post ${i + 1}`,
          url: `https://reddit.com/r/programming/post${i + 1}`,
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        })),
      );

      const aggregator = new RedditAggregator();
      aggregator.initialize(feed, false, {});

      // Create 10 articles that would pass filtering
      const testArticles: RawArticle[] = Array.from({ length: 10 }, (_, i) => ({
        title: `New Reddit Post ${i + 1}`,
        url: `https://reddit.com/r/programming/newpost${i + 1}`,
        published: new Date(),
      }));

      // Test applyArticleLimit directly
      const result = await (aggregator as any).applyArticleLimit(testArticles);

      // Should only return 5 articles (20 limit - 15 already added = 5 remaining)
      expect(result).toHaveLength(5);
    });
  });
});
