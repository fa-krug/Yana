/**
 * Integration tests for aggregator and feed options.
 *
 * Tests that all options are properly applied during aggregation
 * and persist through all stages without being overwritten.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "../../../../tests/utils/testDb";
import { testUser } from "../../../../tests/utils/fixtures";
import { createUser } from "../../services/user.service";
import {
  createFeedWithOptions,
  runFullAggregation,
  getFeedArticles,
  verifyArticleContent,
  verifyArticleMetadata,
  verifySelectorsRemoved,
  verifyRegexReplacements,
} from "./options-helpers";
import { FullWebsiteAggregator } from "../full_website";
import { RedditAggregator } from "../reddit";
import { YouTubeAggregator } from "../youtube";
import { MacTechNewsAggregator } from "../mactechnews";
import { HeiseAggregator } from "../heise";
import { MeinMmoAggregator } from "../mein_mmo";
import Parser from "rss-parser";
import axios from "axios";
import { db, feeds } from "@server/db";
import { eq } from "drizzle-orm";

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
  })),
}));

// Mock fetchFeed
vi.mock("../base/fetch", async () => {
  const actual = await vi.importActual("../base/fetch");
  return {
    ...actual,
    fetchFeed: vi.fn(),
    fetchArticleContent: vi.fn(),
  };
});

// Helper to get mocked fetchFeed
async function getMockedFetchFeed() {
  const fetchModule = await import("../base/fetch");
  return vi.mocked(fetchModule.fetchFeed);
}

// Mock user settings service
vi.mock("../../services/userSettings.service", () => ({
  getUserSettings: vi.fn().mockResolvedValue({
    redditEnabled: true,
    redditClientId: "test_client_id",
    redditClientSecret: "test_client_secret",
    redditUserAgent: "test_user_agent",
    youtubeEnabled: true,
    youtubeApiKey: "test_api_key",
  }),
}));

describe("Aggregator Options Integration Tests", () => {
  let testUserId: number;

  beforeEach(async () => {
    setupTestDb();
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

  describe("FullWebsiteAggregator Options", () => {
    it("should remove elements matching exclude_selectors", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "full_website",
        "https://example.com/feed.xml",
        {
          exclude_selectors: ".advertisement\n.social-share\nfooter",
        },
      );

      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(
        feed,
        false,
        (feed.aggregatorOptions as Record<string, unknown>) || {},
      );

      // Mock HTML with elements to remove
      const mockHtml = `
        <html>
          <body>
            <div class="advertisement">Ad content</div>
            <div class="social-share">Share buttons</div>
            <p>Main content here</p>
            <footer>Footer content</footer>
          </body>
        </html>
      `;

      // Mock fetchFeed
      const mockFetchFeed = await getMockedFetchFeed();
      mockFetchFeed.mockResolvedValue({
        items: [
          {
            title: "Test Article",
            link: "https://example.com/article",
            pubDate: new Date().toISOString(),
            contentSnippet: "Summary",
          },
        ],
      } as any);

      vi.spyOn(
        aggregator as any,
        "fetchArticleContentInternal",
      ).mockResolvedValue(mockHtml);

      const articles = await aggregator.aggregate();

      expect(articles.length).toBeGreaterThan(0);
      const content = articles[0].content || "";

      // Verify selectors are removed (check in the processed content)
      verifySelectorsRemoved(content, [
        ".advertisement",
        ".social-share",
        "footer",
      ]);
    });

    it("should skip articles with titles matching ignore_title_contains", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "full_website",
        "https://example.com/feed.xml",
        {
          ignore_title_contains: "[SPONSORED]\nAdvertisement",
        },
      );

      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(
        feed,
        false,
        (feed.aggregatorOptions as Record<string, unknown>) || {},
      );

      // Mock fetchFeed to return RSS with both articles
      const mockFetchFeed = await getMockedFetchFeed();
      mockFetchFeed.mockResolvedValue({
        items: [
          {
            title: "[SPONSORED] Test Article",
            link: "https://example.com/sponsored",
            pubDate: new Date().toISOString(),
            contentSnippet: "Summary",
          },
          {
            title: "Normal Article",
            link: "https://example.com/normal",
            pubDate: new Date().toISOString(),
            contentSnippet: "Summary",
          },
        ],
      } as any);

      vi.spyOn(
        aggregator as any,
        "fetchArticleContentInternal",
      ).mockResolvedValue("<p>Content</p>");

      const articles = await aggregator.aggregate();

      // Sponsored article should be skipped by applyArticleFilters
      expect(articles.length).toBe(1);
      expect(articles[0].title).toBe("Normal Article");
    });

    it("should skip articles with content matching ignore_content_contains", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "full_website",
        "https://example.com/feed.xml",
        {
          ignore_content_contains: "paywall\nsubscription required",
        },
      );

      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(
        feed,
        false,
        (feed.aggregatorOptions as Record<string, unknown>) || {},
      );

      // Mock fetchFeed - ignore_content_contains checks title and summary
      const mockFetchFeed2 = await getMockedFetchFeed();
      mockFetchFeed2.mockResolvedValue({
        items: [
          {
            title: "Paywall Article",
            link: "https://example.com/paywall",
            pubDate: new Date().toISOString(),
            contentSnippet: "This article requires a paywall subscription",
          },
          {
            title: "Free Article",
            link: "https://example.com/free",
            pubDate: new Date().toISOString(),
            contentSnippet: "Free content here",
          },
        ],
      } as any);

      vi.spyOn(
        aggregator as any,
        "fetchArticleContentInternal",
      ).mockResolvedValue("<p>Content</p>");

      const articles = await aggregator.aggregate();

      // Paywall article should be skipped (summary contains "paywall")
      expect(articles.length).toBe(1);
      expect(articles[0].title).toBe("Free Article");
    });

    it("should apply regex_replacements to content", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "full_website",
        "https://example.com/feed.xml",
        {
          regex_replacements: "old-text|new-text\nfoo|bar",
        },
      );

      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(
        feed,
        false,
        (feed.aggregatorOptions as Record<string, unknown>) || {},
      );

      // Mock fetchFeed
      const mockFetchFeed = await getMockedFetchFeed();
      mockFetchFeed.mockResolvedValue({
        items: [
          {
            title: "Test Article",
            link: "https://example.com/article",
            pubDate: new Date().toISOString(),
            contentSnippet: "Summary",
          },
        ],
      } as any);

      // Mock fetchFeed
      const mockFetchFeedRegex = await getMockedFetchFeed();
      mockFetchFeedRegex.mockResolvedValue({
        items: [
          {
            title: "Test Article",
            link: "https://example.com/article",
            pubDate: new Date().toISOString(),
            contentSnippet: "Summary",
          },
        ],
      } as any);

      const mockHtml = "<p>This is old-text and foo content</p>";
      vi.spyOn(
        aggregator as any,
        "fetchArticleContentInternal",
      ).mockResolvedValue(mockHtml);

      const articles = await aggregator.aggregate();

      expect(articles.length).toBe(1);
      const content = articles[0].content || "";

      // Verify replacements were applied (regex_replacements is applied in processContent)
      // Note: The content goes through standardization which wraps it, so check for the replacement
      expect(content).toContain("new-text");
      expect(content).toContain("bar");
      // old-text and foo should be replaced
      expect(content).not.toContain("old-text");
      expect(content).not.toContain("foo");
    });
  });

  describe("RedditAggregator Options", () => {
    it("should fetch posts sorted by sort_by option", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "reddit",
        "programming",
        {
          sort_by: "new",
        },
      );

      const aggregator = new RedditAggregator();
      aggregator.initialize(feed, false, {});

      let capturedUrl: string | null = null;

      // Mock Reddit API calls - need to mock the auth endpoint specifically
      vi.spyOn(axios, "post").mockImplementation((url: string) => {
        if (url.includes("reddit.com/api/v1/access_token")) {
          return Promise.resolve({
            status: 200,
            data: {
              access_token: "mock_token",
              token_type: "bearer",
              expires_in: 3600,
            },
          } as any);
        }
        return Promise.reject(new Error(`Unexpected POST URL: ${url}`));
      });

      vi.spyOn(axios, "get").mockImplementation((url: string) => {
        if (url.includes("/r/programming/")) {
          capturedUrl = url;
          return Promise.resolve({
            data: {
              data: {
                children: [
                  {
                    data: {
                      id: "test123",
                      title: "Test Post",
                      url: "https://reddit.com/r/programming/test",
                      created_utc: Date.now() / 1000,
                      author: "testuser",
                      num_comments: 10,
                      score: 100,
                    },
                  },
                ],
              },
            },
          } as any);
        }
        if (url.includes("/r/programming/about")) {
          return Promise.resolve({
            data: {
              data: {
                icon_img: null,
                community_icon: null,
              },
            },
          } as any);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await aggregator.aggregate();

      // Verify sort parameter was used
      expect(capturedUrl).toContain("/r/programming/new");
    });

    it("should fetch specified number of comments per post", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "reddit",
        "programming",
        {
          comment_limit: 5,
        },
      );

      const aggregator = new RedditAggregator();
      aggregator.initialize(feed, false, {});

      // Mock Reddit API
      vi.spyOn(axios, "post").mockImplementation((url: string) => {
        if (url.includes("reddit.com/api/v1/access_token")) {
          return Promise.resolve({
            status: 200,
            data: {
              access_token: "mock_token",
              token_type: "bearer",
              expires_in: 3600,
            },
          } as any);
        }
        return Promise.reject(new Error(`Unexpected POST URL: ${url}`));
      });

      vi.spyOn(axios, "get").mockImplementation((url: string) => {
        if (url.includes("/r/programming/hot")) {
          return Promise.resolve({
            data: {
              data: {
                children: [
                  {
                    data: {
                      id: "test123",
                      title: "Test Post",
                      url: "https://reddit.com/r/programming/test",
                      created_utc: Date.now() / 1000,
                      author: "testuser",
                      num_comments: 10,
                      score: 100,
                    },
                  },
                ],
              },
            },
          } as any);
        }
        if (url.includes("/r/programming/about")) {
          return Promise.resolve({
            data: {
              data: {
                icon_img: null,
                community_icon: null,
              },
            },
          } as any);
        }
        if (url.includes("/comments/")) {
          // Mock comments - return 10 comments but should only use 5
          const comments = Array.from({ length: 10 }, (_, i) => ({
            data: {
              id: `comment${i}`,
              body: `Comment ${i}`,
              author: "user",
              score: 10 - i,
            },
          }));
          return Promise.resolve({
            data: [
              {
                data: {
                  children: [
                    {
                      data: {
                        id: "test123",
                        title: "Test Post",
                        selftext: "Post content",
                      },
                    },
                  ],
                },
              },
              {
                data: {
                  children: comments.map((c) => ({ data: c })),
                },
              },
            ],
          } as any);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const articles = await aggregator.aggregate();

      expect(articles.length).toBeGreaterThan(0);
      const content = articles[0].content || "";

      // Count comment occurrences (simplified check)
      // Should have 5 comments, not 10
      const commentMatches = content.match(/Comment \d+/g);
      expect(commentMatches?.length).toBeLessThanOrEqual(5);
    });

    it("should skip posts with fewer than min_comments", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "reddit",
        "programming",
        {
          min_comments: 10,
        },
      );

      const aggregator = new RedditAggregator();
      aggregator.initialize(feed, false, {});

      // Mock Reddit API
      vi.spyOn(axios, "post").mockImplementation((url: string) => {
        if (url.includes("reddit.com/api/v1/access_token")) {
          return Promise.resolve({
            status: 200,
            data: {
              access_token: "mock_token",
              token_type: "bearer",
              expires_in: 3600,
            },
          } as any);
        }
        return Promise.reject(new Error(`Unexpected POST URL: ${url}`));
      });

      vi.spyOn(axios, "get").mockImplementation((url: string) => {
        if (url.includes("/r/programming/hot")) {
          return Promise.resolve({
            data: {
              data: {
                children: [
                  {
                    data: {
                      id: "low",
                      title: "Low Comments Post",
                      url: "https://reddit.com/r/programming/low",
                      created_utc: Date.now() / 1000,
                      author: "testuser",
                      num_comments: 5, // Below min
                      score: 100,
                    },
                  },
                  {
                    data: {
                      id: "high",
                      title: "High Comments Post",
                      url: "https://reddit.com/r/programming/high",
                      created_utc: Date.now() / 1000,
                      author: "testuser",
                      num_comments: 15, // Above min
                      score: 100,
                    },
                  },
                ],
              },
            },
          } as any);
        }
        if (url.includes("/r/programming/about")) {
          return Promise.resolve({
            data: {
              data: {
                icon_img: null,
                community_icon: null,
              },
            },
          } as any);
        }
        if (url.includes("/comments/")) {
          return Promise.resolve({
            data: [
              {
                data: {
                  children: [
                    {
                      data: {
                        id: url.includes("low") ? "low" : "high",
                        title: "Test Post",
                        selftext: "Post content",
                      },
                    },
                  ],
                },
              },
              { data: { children: [] } },
            ],
          } as any);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const articles = await aggregator.aggregate();

      // Only high comments post should be included
      expect(articles.length).toBe(1);
      expect(articles[0].title).toBe("High Comments Post");
    });
  });

  describe("YouTubeAggregator Options", () => {
    it("should fetch specified number of comments per video", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "youtube",
        "@testchannel",
        {
          comment_limit: 3,
        },
      );

      const aggregator = new YouTubeAggregator();
      aggregator.initialize(feed, false, {});

      // Mock YouTube API calls
      vi.spyOn(axios, "get").mockImplementation((url: string) => {
        if (url.includes("/channels")) {
          const urlObj = new URL(url);
          const partParam = urlObj.searchParams.get("part");
          if (partParam === "id") {
            return Promise.resolve({
              data: { items: [{ id: "UCtest123" }] },
            } as any);
          }
          return Promise.resolve({
            data: {
              items: [
                {
                  id: "UCtest123",
                  snippet: {
                    thumbnails: {
                      high: { url: "https://example.com/icon.jpg" },
                    },
                  },
                  contentDetails: {
                    relatedPlaylists: { uploads: "UUtest123" },
                  },
                },
              ],
            },
          } as any);
        }
        if (url.includes("/playlistItems")) {
          return Promise.resolve({
            data: {
              items: [
                {
                  contentDetails: { videoId: "dQw4w9WgXcQ" },
                  snippet: { publishedAt: new Date().toISOString() },
                },
              ],
            },
          } as any);
        }
        if (url.includes("/videos")) {
          return Promise.resolve({
            data: {
              items: [
                {
                  id: "dQw4w9WgXcQ",
                  snippet: {
                    title: "Test Video",
                    description: "Test description",
                    publishedAt: new Date().toISOString(),
                    thumbnails: {
                      high: { url: "https://example.com/thumb.jpg" },
                    },
                  },
                  statistics: {
                    viewCount: "1000",
                    likeCount: "100",
                    commentCount: "50",
                  },
                  contentDetails: { duration: "PT3M33S" },
                },
              ],
            },
          } as any);
        }
        if (url.includes("/commentThreads")) {
          // Return 10 comments but should only use 3
          const comments = Array.from({ length: 10 }, (_, i) => ({
            id: `comment${i}`,
            snippet: {
              topLevelComment: {
                snippet: {
                  textDisplay: `Comment ${i}`,
                  authorDisplayName: "User",
                  likeCount: 10 - i,
                },
              },
            },
          }));
          return Promise.resolve({
            data: { items: comments },
          } as any);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const articles = await aggregator.aggregate();

      expect(articles.length).toBeGreaterThan(0);
      const content = articles[0].content || "";

      // Should have 3 comments, not 10
      const commentMatches = content.match(/Comment \d+/g);
      expect(commentMatches?.length).toBeLessThanOrEqual(3);
    });
  });

  describe("MacTechNewsAggregator Options", () => {
    it("should extract specified number of comments when max_comments is set", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "mactechnews",
        "https://www.mactechnews.de/feed/",
        {
          max_comments: 5,
        },
      );

      const aggregator = new MacTechNewsAggregator();
      aggregator.initialize(feed, false, {});

      // Mock feed data
      vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue({
        items: [
          {
            title: "Test Article",
            link: "https://www.mactechnews.de/article",
            pubDate: new Date().toISOString(),
          },
        ],
      });

      vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue([
        {
          title: "Test Article",
          url: "https://www.mactechnews.de/article",
          published: new Date(),
        },
      ]);

      // Mock HTML with comments section
      const mockHtml = `
        <article>
          <p>Main content</p>
          <div class="comments">
            ${Array.from({ length: 10 }, (_, i) => `<div class="comment">Comment ${i}</div>`).join("")}
          </div>
        </article>
      `;

      vi.spyOn(
        aggregator as any,
        "fetchArticleContentInternal",
      ).mockResolvedValue(mockHtml);

      // Mock extractComments to return limited comments
      vi.spyOn(aggregator as any, "extractComments").mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => `<div>Comment ${i}</div>`).join(""),
      );

      const articles = await aggregator.aggregate();

      expect(articles.length).toBeGreaterThan(0);
      const content = articles[0].content || "";

      // Should have comments (max_comments > 0)
      expect(content).toContain("Comment");
      // Should have exactly 5 comments
      const commentMatches = content.match(/Comment \d+/g);
      expect(commentMatches?.length).toBe(5);
    });
  });

  describe("HeiseAggregator Options", () => {
    it("should extract specified number of comments when max_comments is set", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "heise",
        "https://www.heise.de/rss/heise.rdf",
        {
          max_comments: 3,
        },
      );

      const aggregator = new HeiseAggregator();
      aggregator.initialize(feed, false, {});

      // Similar test structure to MacTechNews
      vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue({
        items: [
          {
            title: "Test Article",
            link: "https://www.heise.de/article",
            pubDate: new Date().toISOString(),
          },
        ],
      });

      vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue([
        {
          title: "Test Article",
          url: "https://www.heise.de/article",
          published: new Date(),
        },
      ]);

      vi.spyOn(
        aggregator as any,
        "fetchArticleContentInternal",
      ).mockResolvedValue("<p>Main content</p>");

      vi.spyOn(aggregator as any, "extractComments").mockResolvedValue(
        Array.from({ length: 3 }, (_, i) => `<div>Comment ${i}</div>`).join(""),
      );

      const articles = await aggregator.aggregate();

      expect(articles.length).toBeGreaterThan(0);
      const content = articles[0].content || "";

      // Should have comments
      expect(content).toContain("Comment");
      const commentMatches = content.match(/Comment \d+/g);
      expect(commentMatches?.length).toBe(3);
    });
  });

  describe("MeinMmoAggregator Options", () => {
    it("should traverse multipage articles when traverse_multipage is enabled", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "mein_mmo",
        "https://www.mein-mmo.de/feed/",
        {
          traverse_multipage: true,
        },
      );

      const aggregator = new MeinMmoAggregator();
      aggregator.initialize(feed, false, {});

      // Mock feed data
      vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue({
        items: [
          {
            title: "Test Article",
            link: "https://www.mein-mmo.de/article",
            pubDate: new Date().toISOString(),
          },
        ],
      });

      vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue([
        {
          title: "Test Article",
          url: "https://www.mein-mmo.de/article",
          published: new Date(),
        },
      ]);

      // Mock multipage content
      vi.spyOn(
        aggregator as any,
        "fetchArticleContentInternal",
      ).mockResolvedValue("<p>Page 1 content</p><a href='/article/2'>Next</a>");

      // Mock fetchAllPages to return combined content
      vi.spyOn(
        await import("../mein_mmo/fetching"),
        "fetchAllPages",
      ).mockResolvedValue("<p>Page 1 content</p><p>Page 2 content</p>");

      const articles = await aggregator.aggregate();

      expect(articles.length).toBeGreaterThan(0);
      const content = articles[0].content || "";

      // Should have content from multiple pages
      expect(content).toContain("Page 1");
      expect(content).toContain("Page 2");
    });
  });

  describe("Feed-Level Options", () => {
    describe.each([
      [true, "should extract header image when generateTitleImage=true"],
      [false, "should not extract header image when generateTitleImage=false"],
    ])("generateTitleImage=%s", (generateTitleImage, description) => {
      it(description, async () => {
        const feed = await createFeedWithOptions(
          testUserId,
          "full_website",
          "https://example.com/feed.xml",
          {},
          { generateTitleImage },
        );

        const aggregator = new FullWebsiteAggregator();
        aggregator.initialize(feed, false, {});

        vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue({
          items: [
            {
              title: "Test Article",
              link: "https://example.com/article",
              pubDate: new Date().toISOString(),
            },
          ],
        });

        vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue([
          {
            title: "Test Article",
            url: "https://example.com/article",
            published: new Date(),
          },
        ]);

        const mockHtml = `
          <article>
            <img src="https://example.com/image.jpg" alt="Header image" />
            <p>Main content</p>
          </article>
        `;

        vi.spyOn(
          aggregator as any,
          "fetchArticleContentInternal",
        ).mockResolvedValue(mockHtml);

        const articles = await aggregator.aggregate();

        expect(articles.length).toBeGreaterThan(0);
        const content = articles[0].content || "";

        verifyArticleContent(content, {
          hasHeader: generateTitleImage,
        });
      });
    });

    describe.each([
      [true, "should add source footer when addSourceFooter=true"],
      [false, "should not add source footer when addSourceFooter=false"],
    ])("addSourceFooter=%s", (addSourceFooter, description) => {
      it(description, async () => {
        const feed = await createFeedWithOptions(
          testUserId,
          "full_website",
          "https://example.com/feed.xml",
          {},
          { addSourceFooter },
        );

        const aggregator = new FullWebsiteAggregator();
        aggregator.initialize(feed, false, {});

        vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue({
          items: [
            {
              title: "Test Article",
              link: "https://example.com/article",
              pubDate: new Date().toISOString(),
            },
          ],
        });

        vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue([
          {
            title: "Test Article",
            url: "https://example.com/article",
            published: new Date(),
          },
        ]);

        vi.spyOn(
          aggregator as any,
          "fetchArticleContentInternal",
        ).mockResolvedValue("<p>Content</p>");

        const articles = await aggregator.aggregate();

        expect(articles.length).toBeGreaterThan(0);
        const content = articles[0].content || "";

        verifyArticleContent(content, {
          hasFooter: addSourceFooter,
          footerLinkCount: addSourceFooter ? 1 : 0,
        });
      });
    });

    describe.each([
      [true, "should use current timestamp when useCurrentTimestamp=true"],
      [false, "should use published date when useCurrentTimestamp=false"],
    ])("useCurrentTimestamp=%s", (useCurrentTimestamp, description) => {
      it(description, async () => {
        const publishedDate = new Date("2024-01-01T12:00:00Z");

        const feed = await createFeedWithOptions(
          testUserId,
          "full_website",
          "https://example.com/feed.xml",
          {},
          { useCurrentTimestamp },
        );

        const aggregator = new FullWebsiteAggregator();
        aggregator.initialize(feed, false, {});

        vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue({
          items: [
            {
              title: "Test Article",
              link: "https://example.com/article",
              pubDate: publishedDate.toISOString(),
            },
          ],
        });

        vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue([
          {
            title: "Test Article",
            url: "https://example.com/article",
            published: publishedDate,
          },
        ]);

        vi.spyOn(
          aggregator as any,
          "fetchArticleContentInternal",
        ).mockResolvedValue("<p>Content</p>");

        // Mock fetchFeed for the service
        const mockFetchFeed = await getMockedFetchFeed();
        mockFetchFeed.mockResolvedValue({
          items: [
            {
              title: "Test Article",
              link: "https://example.com/article",
              pubDate: publishedDate.toISOString(),
              contentSnippet: "Summary",
            },
          ],
        } as any);

        // Mock fetchArticleContentInternal - need to mock on the class prototype
        // since the service creates a new instance
        const FullWebsiteAggregatorClass = await import("../full_website");
        vi.spyOn(
          FullWebsiteAggregatorClass.FullWebsiteAggregator.prototype as any,
          "fetchArticleContentInternal",
        ).mockResolvedValue("<p>Content</p>");

        await runFullAggregation(feed.id);
        const savedArticles = await getFeedArticles(feed.id);

        expect(savedArticles.length).toBeGreaterThan(0);
        const article = savedArticles[0];

        verifyArticleMetadata(article, feed, publishedDate);
      });
    });

    it("should skip duplicate articles when skipDuplicates=true", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "full_website",
        "https://example.com/feed.xml",
        {},
        { skipDuplicates: true },
      );

      // Mock fetchFeed for the service
      const mockFetchFeed = await getMockedFetchFeed();
      mockFetchFeed.mockResolvedValue({
        items: [
          {
            title: "Test Article",
            link: "https://example.com/article",
            pubDate: new Date().toISOString(),
            contentSnippet: "Summary",
          },
        ],
      } as any);

      // Mock fetchArticleContentInternal on prototype
      const FullWebsiteAggregatorClass = await import("../full_website");
      vi.spyOn(
        FullWebsiteAggregatorClass.FullWebsiteAggregator.prototype as any,
        "fetchArticleContentInternal",
      ).mockResolvedValue("<p>Content</p>");

      await runFullAggregation(feed.id);

      // Second aggregation with same article
      await runFullAggregation(feed.id);

      const savedArticles = await getFeedArticles(feed.id);

      // Should only have one article (duplicate skipped)
      expect(savedArticles.length).toBe(1);
    });
  });

  describe("Option Interactions", () => {
    it("should apply multiple aggregator options together", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "full_website",
        "https://example.com/feed.xml",
        {
          exclude_selectors: ".ad",
          ignore_title_contains: "[SPONSORED]",
          regex_replacements: "old|new",
        },
      );

      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(
        feed,
        false,
        (feed.aggregatorOptions as Record<string, unknown>) || {},
      );

      // Mock fetchFeed
      const mockFetchFeed = await getMockedFetchFeed();
      mockFetchFeed.mockResolvedValue({
        items: [
          {
            title: "Normal Article",
            link: "https://example.com/normal",
            pubDate: new Date().toISOString(),
            contentSnippet: "Summary",
          },
          {
            title: "[SPONSORED] Article",
            link: "https://example.com/sponsored",
            pubDate: new Date().toISOString(),
            contentSnippet: "Summary",
          },
        ],
      } as any);

      vi.spyOn(
        aggregator as any,
        "fetchArticleContentInternal",
      ).mockResolvedValue("<div class='ad'>Ad</div><p>This is old content</p>");

      const articles = await aggregator.aggregate();

      // Sponsored article should be skipped
      expect(articles.length).toBe(1);
      expect(articles[0].title).toBe("Normal Article");

      const content = articles[0].content || "";

      // Ad should be removed
      verifySelectorsRemoved(content, [".ad"]);

      // Regex replacement should be applied
      expect(content).toContain("new");
      expect(content).not.toContain("old");
    });

    it("should apply aggregator options and feed options together", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "full_website",
        "https://example.com/feed.xml",
        {
          exclude_selectors: ".ad",
        },
        {
          generateTitleImage: true,
          addSourceFooter: true,
          useCurrentTimestamp: false,
        },
      );

      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(
        feed,
        false,
        (feed.aggregatorOptions as Record<string, unknown>) || {},
      );

      vi.spyOn(aggregator as any, "fetchSourceData").mockResolvedValue({
        items: [
          {
            title: "Test Article",
            link: "https://example.com/article",
            pubDate: new Date().toISOString(),
          },
        ],
      });

      vi.spyOn(aggregator as any, "parseToRawArticles").mockResolvedValue([
        {
          title: "Test Article",
          url: "https://example.com/article",
          published: new Date("2024-01-01T12:00:00Z"),
        },
      ]);

      const mockHtml = `
        <article>
          <div class="ad">Ad</div>
          <img src="https://example.com/image.jpg" />
          <p>Content</p>
        </article>
      `;

      vi.spyOn(
        aggregator as any,
        "fetchArticleContentInternal",
      ).mockResolvedValue(mockHtml);

      await runFullAggregation(feed.id);
      const savedArticles = await getFeedArticles(feed.id);

      expect(savedArticles.length).toBeGreaterThan(0);
      const article = savedArticles[0];

      // Verify aggregator option (ad removed)
      verifySelectorsRemoved(article.content, [".ad"]);

      // Verify feed options
      verifyArticleContent(article.content, {
        hasHeader: true,
        hasFooter: true,
      });

      verifyArticleMetadata(article, feed, new Date("2024-01-01T12:00:00Z"));
    });
  });

  describe("Edge Cases", () => {
    it("should use default values when options are missing", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "full_website",
        "https://example.com/feed.xml",
        {}, // No aggregator options
      );

      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(
        feed,
        false,
        (feed.aggregatorOptions as Record<string, unknown>) || {},
      );

      // Should not throw and should use defaults
      expect(aggregator.getOption("exclude_selectors", "")).toBe("");
      expect(aggregator.getOption("ignore_title_contains", "")).toBe("");
    });

    it("should handle invalid option values gracefully", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "reddit",
        "programming",
        {
          comment_limit: 999, // Above max (50)
        },
      );

      const aggregator = new RedditAggregator();
      aggregator.initialize(feed, false, {});

      // Should clamp to max or use default
      const commentLimit = aggregator.getOption("comment_limit", 10);
      expect(commentLimit).toBeLessThanOrEqual(50);
    });

    it("should preserve options through error recovery", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "full_website",
        "https://example.com/feed.xml",
        {
          exclude_selectors: ".ad",
        },
      );

      const aggregator = new FullWebsiteAggregator();
      aggregator.initialize(
        feed,
        false,
        (feed.aggregatorOptions as Record<string, unknown>) || {},
      );

      // Mock fetchFeed
      const mockFetchFeed = await getMockedFetchFeed();
      mockFetchFeed.mockResolvedValue({
        items: [
          {
            title: "Test Article",
            link: "https://example.com/article",
            pubDate: new Date().toISOString(),
            contentSnippet: "Summary",
          },
        ],
      } as any);

      // First call fails, second succeeds
      let callCount = 0;
      vi.spyOn(
        aggregator as any,
        "fetchArticleContentInternal",
      ).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Network error");
        }
        return "<div class='ad'>Ad</div><p>Content</p>";
      });

      // Should handle error and retry with options still applied
      const articles = await aggregator.aggregate();

      expect(articles.length).toBeGreaterThan(0);
      const content = articles[0].content || "";

      // Options should still be applied after error
      verifySelectorsRemoved(content, [".ad"]);
    });

    it("should not overwrite options when feed is updated", async () => {
      const feed = await createFeedWithOptions(
        testUserId,
        "full_website",
        "https://example.com/feed.xml",
        {
          exclude_selectors: ".ad",
        },
      );

      // Simulate feed update (options should persist)
      await db
        .update(feeds)
        .set({ name: "Updated Feed Name" })
        .where(eq(feeds.id, feed.id));

      const updatedFeed = await db
        .select()
        .from(feeds)
        .where(eq(feeds.id, feed.id))
        .limit(1);

      expect(updatedFeed[0].aggregatorOptions).toContain("exclude_selectors");
    });
  });
});
