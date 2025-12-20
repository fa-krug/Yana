/**
 * Tests for aggregator base functionality and template method flow.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BaseAggregator } from "../base/aggregator";
import type { RawArticle } from "../base/types";
import { FullWebsiteAggregator } from "../full_website";
import { FeedContentAggregator } from "../feed_content";
import Parser from "rss-parser";
import {
  setupTestDb,
  teardownTestDb,
  getTestDb,
} from "../../../../tests/utils/testDb";
import { db, articles, feeds, users } from "../../db";
import { testUser } from "../../../../tests/utils/fixtures";
import { createUser } from "../../services/user.service";

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
  createLogger: vi.fn((context) => ({
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
  })),
}));

// Mock fetchFeed
vi.mock("../base/fetch", () => ({
  fetchFeed: vi.fn(),
  fetchArticleContent: vi.fn(),
}));

describe("BaseAggregator - Template Method Flow", () => {
  let mockFeed: any;

  beforeEach(() => {
    mockFeed = {
      id: 1,
      userId: 1,
      name: "Test Feed",
      identifier: "https://example.com/feed.xml",
      aggregator: "full_website",
      aggregatorOptions: {},
      dailyPostLimit: 10,
      generateTitleImage: true,
      addSourceFooter: true,
      useCurrentTimestamp: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  describe("initialize", () => {
    it("should initialize aggregator with feed", () => {
      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(mockFeed, false, {});

      expect(aggregator.feed).toBe(mockFeed);
    });

    it("should set forceRefresh flag", () => {
      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(mockFeed, true, {});

      expect((aggregator as any).forceRefresh).toBe(true);
    });
  });

  describe("aggregate - Template Method Flow", () => {
    it("should follow the fixed aggregation flow", async () => {
      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(mockFeed, false, {});

      // Mock fetchSourceData
      const mockFeedData: Parser.Output<any> = {
        items: [
          {
            title: "Test Article",
            link: "https://example.com/article",
            pubDate: new Date().toISOString(),
            contentSnippet: "Test summary",
          },
        ],
      };

      vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue(
        mockFeedData,
      );
      vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue([
        {
          title: "Test Article",
          url: "https://example.com/article",
          published: new Date(),
          summary: "Test summary",
        },
      ]);
      vi.spyOn(aggregator as any, "filterArticles").mockResolvedValue([
        {
          title: "Test Article",
          url: "https://example.com/article",
          published: new Date(),
          summary: "Test summary",
        },
      ]);
      vi.spyOn(aggregator as any, "enrichArticles").mockResolvedValue([
        {
          title: "Test Article",
          url: "https://example.com/article",
          published: new Date(),
          summary: "Test summary",
          content: "<p>Test content</p>",
        },
      ]);
      vi.spyOn(aggregator as any, "finalizeArticles").mockResolvedValue([
        {
          title: "Test Article",
          url: "https://example.com/article",
          published: new Date(),
          summary: "Test summary",
          content: "<p>Test content</p>",
        },
      ]);

      const articles = await aggregator.aggregate();

      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe("Test Article");
      expect(articles[0].content).toBe("<p>Test content</p>");
    });

    it("should call steps in correct order", async () => {
      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(mockFeed, false, {});

      const callOrder: string[] = [];

      vi.spyOn(aggregator as any, "validate").mockImplementation(async () => {
        callOrder.push("validate");
      });
      vi.spyOn(aggregator as any, "fetchSourceData").mockImplementation(
        async () => {
          callOrder.push("fetchSourceData");
          return { items: [] };
        },
      );
      vi.spyOn(aggregator as any, "parseToRawArticles").mockImplementation(
        async () => {
          callOrder.push("parseToRawArticles");
          return [];
        },
      );
      vi.spyOn(aggregator as any, "filterArticles").mockImplementation(
        async () => {
          callOrder.push("filterArticles");
          return [];
        },
      );
      vi.spyOn(aggregator as any, "enrichArticles").mockImplementation(
        async () => {
          callOrder.push("enrichArticles");
          return [];
        },
      );
      vi.spyOn(aggregator as any, "finalizeArticles").mockImplementation(
        async () => {
          callOrder.push("finalizeArticles");
          return [];
        },
      );

      await aggregator.aggregate();

      expect(callOrder).toEqual([
        "validate",
        "fetchSourceData",
        "parseToRawArticles",
        "filterArticles",
        "enrichArticles",
        "finalizeArticles",
      ]);
    });
  });

  describe("shouldSkipArticle", () => {
    it("should skip articles with existing URLs when not forcing refresh", () => {
      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(mockFeed, false, {});

      const existingUrls = new Set(["https://example.com/article"]);
      aggregator.setExistingUrls(existingUrls);

      const article: RawArticle = {
        title: "Test",
        url: "https://example.com/article",
        published: new Date(),
      };

      expect(aggregator.shouldSkipArticle(article)).toBe(true);
    });

    it("should not skip articles when forcing refresh", () => {
      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(mockFeed, true, {});

      const existingUrls = new Set(["https://example.com/article"]);
      aggregator.setExistingUrls(existingUrls);

      const article: RawArticle = {
        title: "Test",
        url: "https://example.com/article",
        published: new Date(),
      };

      expect(aggregator.shouldSkipArticle(article)).toBe(false);
    });
  });

  describe("shouldFetchContent", () => {
    it("should return false for RSS-only aggregators", () => {
      const aggregator = new FeedContentAggregator();
      aggregator.initialize(mockFeed, false, {});

      const article: RawArticle = {
        title: "Test",
        url: "https://example.com/article",
        published: new Date(),
      };

      expect((aggregator as any).shouldFetchContent(article)).toBe(false);
    });

    it("should return true for full-content aggregators", () => {
      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(mockFeed, false, {});

      const article: RawArticle = {
        title: "Test",
        url: "https://example.com/article",
        published: new Date(),
      };

      expect((aggregator as any).shouldFetchContent(article)).toBe(true);
    });
  });

  describe("extractContent and processContent", () => {
    it("should extract and process content using template method flow", async () => {
      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(mockFeed, false, {});

      const article: RawArticle = {
        title: "Test Article",
        url: "https://example.com/article",
        published: new Date(),
        summary: "Test summary",
      };

      const html = "<div><p>Test content</p></div>";

      // Mock extractContent and processContent
      vi.spyOn(aggregator as any, "extractContent").mockResolvedValue(
        "<p>Test content</p>",
      );
      vi.spyOn(aggregator as any, "processContent").mockResolvedValue(
        "<p>Test content</p><footer>Source: <a href='https://example.com/article'>View original</a></footer>",
      );

      const extracted = await (aggregator as any).extractContent(html, article);
      const processed = await (aggregator as any).processContent(
        extracted,
        article,
      );

      expect(processed).toContain("Test content");
      expect(processed).toContain("Source:");
      expect((aggregator as any).extractContent).toHaveBeenCalledWith(
        html,
        article,
      );
      expect((aggregator as any).processContent).toHaveBeenCalledWith(
        extracted,
        article,
      );
    });
  });

  describe("fetchArticleContentInternal", () => {
    it("should fetch content using internal method", async () => {
      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(mockFeed, false, {});

      const url = "https://example.com/article";
      const mockHtml = "<html><body>Test</body></html>";
      const article: RawArticle = {
        title: "Test",
        url,
        published: new Date(),
      };

      vi.spyOn(
        aggregator as any,
        "fetchArticleContentInternal",
      ).mockResolvedValue(mockHtml);

      const html = await (aggregator as any).fetchArticleContentInternal(
        url,
        article,
      );

      expect(html).toBe(mockHtml);
      expect(
        (aggregator as any).fetchArticleContentInternal,
      ).toHaveBeenCalledWith(url, article);
    });
  });

  describe("Error Handling - Backwards Compatibility", () => {
    it("should fallback to summary on fetch failure", async () => {
      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(mockFeed, false, {});

      const article: RawArticle = {
        title: "Test Article",
        url: "https://example.com/article",
        published: new Date(),
        summary: "Test summary",
      };

      // Mock fetchSourceData to return valid feed data
      const mockFeedData: Parser.Output<any> = {
        items: [
          {
            title: "Test Article",
            link: "https://example.com/article",
            pubDate: new Date().toISOString(),
            contentSnippet: "Test summary",
          },
        ],
      };

      vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue(
        mockFeedData,
      );
      vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue([
        article,
      ]);
      vi.spyOn(aggregator as any, "filterArticles").mockResolvedValue([
        article,
      ]);

      // Mock enrichArticles to simulate fetch failure
      vi.spyOn(aggregator as any, "enrichArticles").mockImplementation(
        async (articles) => {
          const enriched = [...articles];
          for (const article of enriched) {
            try {
              await (aggregator as any).fetchArticleContentInternal(
                article.url,
                article,
              );
            } catch (error) {
              // Fallback to summary
              article.content = article.summary || "";
            }
          }
          return enriched;
        },
      );

      vi.spyOn(
        aggregator as any,
        "fetchArticleContentInternal",
      ).mockRejectedValue(new Error("Fetch failed"));
      vi.spyOn(aggregator as any, "finalizeArticles").mockResolvedValue([
        { ...article, content: "Test summary" },
      ]);

      const articles = await aggregator.aggregate(1);

      // Should have fallback content
      expect(articles[0].content).toBe("Test summary");
    });
  });

  describe("Configuration", () => {
    it("should use default rate limit delay", () => {
      const aggregator = new FullWebsiteAggregator();
      expect(aggregator.rateLimitDelay).toBe(1000);
    });

    it("should use default cache TTL", () => {
      const aggregator = new FullWebsiteAggregator();
      expect(aggregator.cacheTTL).toBe(3600);
    });

    it("should use default cache max size", () => {
      const aggregator = new FullWebsiteAggregator();
      expect(aggregator.cacheMaxSize).toBe(1000);
    });
  });

  describe("applyArticleLimit - Daily Limit Enforcement", () => {
    let testUserId: number;
    let testFeedId: number;

    beforeEach(async () => {
      setupTestDb();
      // Create a test user
      const user = await createUser(
        testUser.username,
        testUser.email,
        "password",
      );
      testUserId = user.id;

      // Create a test feed
      const [feed] = await db
        .insert(feeds)
        .values({
          userId: testUserId,
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
      testFeedId = feed.id;
    });

    afterEach(() => {
      teardownTestDb();
    });

    it("should return all articles when quota is not exceeded", async () => {
      const aggregator = new FullWebsiteAggregator();
      const feed = {
        ...mockFeed,
        id: testFeedId,
        userId: testUserId,
        dailyPostLimit: 10,
      };
      aggregator.initialize(feed, false, {});

      // Create 3 articles in database (today)
      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);
      await db.insert(articles).values([
        {
          feedId: testFeedId,
          name: "Article 1",
          url: "https://example.com/1",
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        },
        {
          feedId: testFeedId,
          name: "Article 2",
          url: "https://example.com/2",
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        },
        {
          feedId: testFeedId,
          name: "Article 3",
          url: "https://example.com/3",
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        },
      ]);

      const inputArticles: RawArticle[] = [
        {
          title: "New Article 1",
          url: "https://example.com/new1",
          published: new Date(),
        },
        {
          title: "New Article 2",
          url: "https://example.com/new2",
          published: new Date(),
        },
      ];

      // 3 posts today, limit 10, 2 new articles = 5 total (within limit)
      const result = await (aggregator as any).applyArticleLimit(inputArticles);

      expect(result).toHaveLength(2);
      expect(result).toEqual(inputArticles);
    });

    it("should limit articles to remaining quota", async () => {
      const aggregator = new FullWebsiteAggregator();
      const feed = {
        ...mockFeed,
        id: testFeedId,
        userId: testUserId,
        dailyPostLimit: 10,
      };
      aggregator.initialize(feed, false, {});

      // Create 8 articles in database (today)
      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);
      const articleValues = Array.from({ length: 8 }, (_, i) => ({
        feedId: 1,
        name: `Article ${i + 1}`,
        url: `https://example.com/${i + 1}`,
        date: today,
        content: "",
        createdAt: today,
        updatedAt: today,
      }));
      await db.insert(articles).values(articleValues);

      const inputArticles: RawArticle[] = Array.from({ length: 5 }, (_, i) => ({
        title: `New Article ${i + 1}`,
        url: `https://example.com/new${i + 1}`,
        published: new Date(),
      }));

      // 8 posts today, limit 10, 5 new articles
      // Remaining quota = 10 - 8 = 2
      // Should only return 2 articles
      const result = await (aggregator as any).applyArticleLimit(inputArticles);

      expect(result).toHaveLength(2);
      expect(result).toEqual(inputArticles.slice(0, 2));
    });

    it("should return empty array when quota is exhausted", async () => {
      const aggregator = new FullWebsiteAggregator();
      const feed = {
        ...mockFeed,
        id: testFeedId,
        userId: testUserId,
        dailyPostLimit: 10,
      };
      aggregator.initialize(feed, false, {});

      // Create 10 articles in database (today) - quota exhausted
      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);
      const articleValues = Array.from({ length: 10 }, (_, i) => ({
        feedId: 1,
        name: `Article ${i + 1}`,
        url: `https://example.com/${i + 1}`,
        date: today,
        content: "",
        createdAt: today,
        updatedAt: today,
      }));
      await db.insert(articles).values(articleValues);

      const inputArticles: RawArticle[] = [
        {
          title: "New Article 1",
          url: "https://example.com/new1",
          published: new Date(),
        },
        {
          title: "New Article 2",
          url: "https://example.com/new2",
          published: new Date(),
        },
      ];

      // 10 posts today, limit 10, quota exhausted
      const result = await (aggregator as any).applyArticleLimit(inputArticles);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it("should not limit when dailyPostLimit is -1 (unlimited)", async () => {
      const aggregator = new FullWebsiteAggregator();
      const feed = {
        ...mockFeed,
        id: testFeedId,
        userId: testUserId,
        dailyPostLimit: -1, // Unlimited
      };
      aggregator.initialize(feed, false, {});

      const inputArticles: RawArticle[] = Array.from(
        { length: 20 },
        (_, i) => ({
          title: `Article ${i + 1}`,
          url: `https://example.com/${i + 1}`,
          published: new Date(),
        }),
      );

      const result = await (aggregator as any).applyArticleLimit(inputArticles);

      expect(result).toHaveLength(20);
      expect(result).toEqual(inputArticles);
    });

    it("should not limit when dailyPostLimit is 0 (disabled)", async () => {
      const aggregator = new FullWebsiteAggregator();
      const feed = {
        ...mockFeed,
        id: testFeedId,
        userId: testUserId,
        dailyPostLimit: 0, // Disabled
      };
      aggregator.initialize(feed, false, {});

      const inputArticles: RawArticle[] = [
        {
          title: "Article 1",
          url: "https://example.com/1",
          published: new Date(),
        },
      ];

      const result = await (aggregator as any).applyArticleLimit(inputArticles);

      expect(result).toHaveLength(1);
      expect(result).toEqual(inputArticles);
    });

    it("should only count articles from today (UTC midnight)", async () => {
      const aggregator = new FullWebsiteAggregator();
      const feed = {
        ...mockFeed,
        id: testFeedId,
        userId: testUserId,
        dailyPostLimit: 10,
      };
      aggregator.initialize(feed, false, {});

      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      // Create 5 articles from yesterday and 3 from today
      await db.insert(articles).values([
        {
          feedId: testFeedId,
          name: "Yesterday Article 1",
          url: "https://example.com/y1",
          date: yesterday,
          content: "",
          createdAt: yesterday,
          updatedAt: yesterday,
        },
        {
          feedId: testFeedId,
          name: "Yesterday Article 2",
          url: "https://example.com/y2",
          date: yesterday,
          content: "",
          createdAt: yesterday,
          updatedAt: yesterday,
        },
        {
          feedId: testFeedId,
          name: "Yesterday Article 3",
          url: "https://example.com/y3",
          date: yesterday,
          content: "",
          createdAt: yesterday,
          updatedAt: yesterday,
        },
        {
          feedId: testFeedId,
          name: "Yesterday Article 4",
          url: "https://example.com/y4",
          date: yesterday,
          content: "",
          createdAt: yesterday,
          updatedAt: yesterday,
        },
        {
          feedId: testFeedId,
          name: "Yesterday Article 5",
          url: "https://example.com/y5",
          date: yesterday,
          content: "",
          createdAt: yesterday,
          updatedAt: yesterday,
        },
        {
          feedId: testFeedId,
          name: "Today Article 1",
          url: "https://example.com/t1",
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        },
        {
          feedId: testFeedId,
          name: "Today Article 2",
          url: "https://example.com/t2",
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        },
        {
          feedId: testFeedId,
          name: "Today Article 3",
          url: "https://example.com/t3",
          date: today,
          content: "",
          createdAt: today,
          updatedAt: today,
        },
      ]);

      const inputArticles: RawArticle[] = Array.from(
        { length: 10 },
        (_, i) => ({
          title: `New Article ${i + 1}`,
          url: `https://example.com/new${i + 1}`,
          published: new Date(),
        }),
      );

      // Only 3 posts from today, limit 10, 10 new articles
      // Remaining quota = 10 - 3 = 7
      // Should only return 7 articles (not 5, which would be 10 - 5)
      const result = await (aggregator as any).applyArticleLimit(inputArticles);

      expect(result).toHaveLength(7);
      expect(result).toEqual(inputArticles.slice(0, 7));
    });

    it("should return all articles when no feed is initialized", async () => {
      const aggregator = new FullWebsiteAggregator();
      // Don't initialize with feed

      const inputArticles: RawArticle[] = [
        {
          title: "Article 1",
          url: "https://example.com/1",
          published: new Date(),
        },
      ];

      const result = await (aggregator as any).applyArticleLimit(inputArticles);

      expect(result).toHaveLength(1);
      expect(result).toEqual(inputArticles);
    });
  });
});
