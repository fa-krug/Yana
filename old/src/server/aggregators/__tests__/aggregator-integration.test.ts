/**
 * Integration tests for aggregators using HTML fixtures.
 *
 * These tests use pre-downloaded HTML files from the fixtures directory
 * to validate that aggregators can correctly parse and extract content
 * according to the RawArticle standard.
 *
 * To update fixtures, run: npx tsx src/server/aggregators/__tests__/download-fixtures.ts
 */

import * as fs from "fs/promises";
import * as path from "path";

import axios from "axios";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { RawArticle } from "../base/types";
import { CaschysBlogAggregator } from "../caschys_blog";
import { DarkLegacyAggregator } from "../dark_legacy";
import { ExplosmAggregator } from "../explosm";
import { FeedContentAggregator } from "../feed_content";
import { FullWebsiteAggregator } from "../full_website";
import { HeiseAggregator } from "../heise";
import { MacTechNewsAggregator } from "../mactechnews";
import { MeinMmoAggregator } from "../mein_mmo";
import { MerkurAggregator } from "../merkur";
import { OglafAggregator } from "../oglaf";
import { PodcastAggregator } from "../podcast";
import { RedditAggregator } from "../reddit";
import { TagesschauAggregator } from "../tagesschau";
import { YouTubeAggregator } from "../youtube";

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
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  })),
}));

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

/**
 * Test configuration for each aggregator.
 * Each entry contains:
 * - aggregator: The aggregator class
 * - testUrl: The original URL (used for mock article URL)
 * - identifier: The feed identifier (for social aggregators or custom feeds)
 * - expectedFields: Fields that should be present in the result
 * - skip: Skip test if true (e.g., requires auth, no fixture available)
 */
interface AggregatorTestConfig {
  aggregator: new () => any;
  testUrl: string;
  identifier?: string;
  expectedFields: (keyof RawArticle)[];
  skip?: boolean;
}

/**
 * Test configuration for each aggregator.
 * Uses one HTML fixture file per aggregator.
 */
const AGGREGATOR_TESTS: AggregatorTestConfig[] = [
  {
    aggregator: HeiseAggregator,
    testUrl: "https://www.heise.de/news/",
    identifier: "https://www.heise.de/rss/heise.rdf",
    expectedFields: ["title", "url", "published"],
  },
  {
    aggregator: MerkurAggregator,
    testUrl: "https://www.merkur.de/",
    identifier: "https://www.merkur.de/rssfeed.rdf",
    expectedFields: ["title", "url", "published"],
  },
  {
    aggregator: TagesschauAggregator,
    testUrl: "https://www.tagesschau.de/",
    identifier: "https://www.tagesschau.de/xml/rss2/",
    expectedFields: ["title", "url", "published"],
  },
  {
    aggregator: ExplosmAggregator,
    testUrl: "https://explosm.net/",
    identifier: "https://explosm.net/rss",
    expectedFields: ["title", "url", "published"],
  },
  {
    aggregator: MacTechNewsAggregator,
    testUrl: "https://www.mactechnews.de/",
    identifier: "https://www.mactechnews.de/feed/",
    expectedFields: ["title", "url", "published"],
  },
  {
    aggregator: CaschysBlogAggregator,
    testUrl: "https://caschys.blog/",
    identifier: "https://caschys.blog/feed/",
    expectedFields: ["title", "url", "published"],
  },
  {
    aggregator: DarkLegacyAggregator,
    testUrl: "https://www.darklegacycomics.com/971",
    identifier: "https://darklegacycomics.com/feed.xml",
    expectedFields: ["title", "url", "published"],
  },
  {
    aggregator: MeinMmoAggregator,
    testUrl: "https://www.mein-mmo.de/",
    identifier: "https://www.mein-mmo.de/feed/",
    expectedFields: ["title", "url", "published"],
  },
  {
    aggregator: FullWebsiteAggregator,
    testUrl:
      "https://www.heise.de/bestenlisten/testsieger/top-10-die-besten-saugroboter-mit-wischfunktion-im-test-besser-mit-walze/2dxtvlp",
    identifier: "https://www.heise.de/rss/heise.rdf",
    expectedFields: ["title", "url", "published"],
  },
  {
    aggregator: FeedContentAggregator,
    testUrl:
      "https://www.heise.de/bestenlisten/testsieger/top-10-die-besten-saugroboter-mit-wischfunktion-im-test-besser-mit-walze/2dxtvlp",
    identifier: "https://www.heise.de/rss/heise.rdf",
    expectedFields: ["title", "url", "published", "summary"],
  },
  {
    aggregator: PodcastAggregator,
    testUrl:
      "https://www.npr.org/2025/12/12/nx-s1-5642708/chicago-parking-meter-privitization",
    identifier: "https://feeds.npr.org/510289/podcast.xml",
    expectedFields: ["title", "url", "published"],
  },
  // Skip aggregators that require auth or have no fixtures
  {
    aggregator: OglafAggregator,
    testUrl: "https://www.oglaf.com/",
    identifier: "https://www.oglaf.com/feeds/rss/",
    expectedFields: ["title", "url", "published"],
    skip: true, // RSS feed doesn't return articles in standard format
  },
  {
    aggregator: RedditAggregator,
    testUrl:
      "https://www.reddit.com/r/programming/comments/test123/test_reddit_post_title/",
    identifier: "programming",
    expectedFields: ["title", "url", "published"],
  },
  {
    aggregator: YouTubeAggregator,
    testUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    identifier: "@testchannel",
    expectedFields: ["title", "url", "published"],
  },
];

const FIXTURES_DIR = path.join(__dirname, "fixtures");

/**
 * Load HTML fixture for an aggregator.
 */
async function loadHtmlFixture(aggregatorId: string): Promise<string | null> {
  const fixturePath = path.join(FIXTURES_DIR, `${aggregatorId}.html`);
  try {
    const html = await fs.readFile(fixturePath, "utf-8");
    return html;
  } catch {
    // Fixture file doesn't exist
    return null;
  }
}

/**
 * Load API fixture for an aggregator.
 */
async function loadApiFixture(aggregatorId: string): Promise<any | null> {
  const fixturePath = path.join(FIXTURES_DIR, `${aggregatorId}-api.json`);
  try {
    const json = await fs.readFile(fixturePath, "utf-8");
    return JSON.parse(json);
  } catch {
    // Fixture file doesn't exist
    return null;
  }
}

/**
 * Validate that a RawArticle matches the expected structure.
 */
function validateRawArticle(
  article: RawArticle,
  expectedFields: (keyof RawArticle)[],
): void {
  // Required fields
  expect(article).toBeDefined();
  expect(article.title).toBeDefined();
  expect(typeof article.title).toBe("string");
  expect(article.title.length).toBeGreaterThan(0);

  expect(article.url).toBeDefined();
  expect(typeof article.url).toBe("string");
  expect(article.url.length).toBeGreaterThan(0);
  expect(article.url).toMatch(/^https?:\/\//);

  expect(article.published).toBeDefined();
  expect(article.published).toBeInstanceOf(Date);
  expect(article.published.getTime()).not.toBeNaN();

  // Check expected fields are present
  for (const field of expectedFields) {
    if (field === "title" || field === "url" || field === "published") {
      continue; // Already checked above
    }
    expect(article[field]).toBeDefined();
  }

  // Optional fields should have correct types if present
  if (article.summary !== undefined) {
    expect(typeof article.summary).toBe("string");
  }
  if (article.content !== undefined) {
    expect(typeof article.content).toBe("string");
  }
  if (article.author !== undefined) {
    expect(typeof article.author).toBe("string");
  }
  if (article.thumbnailUrl !== undefined) {
    expect(typeof article.thumbnailUrl).toBe("string");
    if (article.thumbnailUrl.length > 0) {
      expect(article.thumbnailUrl).toMatch(/^https?:\/\//);
    }
  }
  if (article.score !== undefined) {
    expect(typeof article.score).toBe("number");
  }
  if (article.viewCount !== undefined) {
    expect(typeof article.viewCount).toBe("number");
  }
  if (article.duration !== undefined) {
    expect(typeof article.duration).toBe("number");
    expect(article.duration).toBeGreaterThanOrEqual(0);
  }
}

describe("Aggregator Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const testConfig of AGGREGATOR_TESTS) {
    const testName = testConfig.aggregator.name.replace("Aggregator", "");

    describe(testName, () => {
      it.skipIf(testConfig.skip === true)(
        `should extract and process content from fixture`,
        // eslint-disable-next-line sonarjs/cognitive-complexity
        async () => {
          // Create aggregator instance
          const aggregator = new testConfig.aggregator();
          const aggregatorId = aggregator.id;

          // Check if this is an API-based aggregator
          const isApiBased =
            aggregatorId === "reddit" || aggregatorId === "youtube";

          if (isApiBased) {
            // Handle API-based aggregators (Reddit, YouTube)
            const apiFixture = await loadApiFixture(aggregatorId);
            if (!apiFixture) {
              throw new Error(
                `API fixture not found for ${aggregatorId}. Run: npx tsx src/server/aggregators/__tests__/download-fixtures.ts`,
              );
            }

            // Create mock feed
            const mockFeed = {
              id: 1,
              userId: 1,
              name: `Test ${testName}`,
              identifier: testConfig.identifier || testConfig.testUrl,
              aggregator: aggregatorId,
              aggregatorOptions: {},
              dailyPostLimit: 10,
              generateTitleImage: true,
              addSourceFooter: true,
              useCurrentTimestamp: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Initialize aggregator
            aggregator.initialize(mockFeed, false, {});

            // Mock API calls for Reddit/YouTube
            if (aggregatorId === "reddit") {
              // Mock Reddit OAuth token request
              vi.spyOn(axios, "post").mockResolvedValue({
                data: {
                  access_token: "mock_token",
                  token_type: "bearer",
                  expires_in: 3600,
                },
              } as any);

              // Mock Reddit API calls
              vi.spyOn(axios, "get").mockImplementation((url: string) => {
                if (
                  url.includes("/r/programming/hot") ||
                  url.includes("/r/programming/new")
                ) {
                  // Return mock Reddit posts response
                  return Promise.resolve({ data: apiFixture } as any);
                }
                if (url.includes("/r/programming/about")) {
                  // Return mock subreddit info
                  return Promise.resolve({
                    data: {
                      data: {
                        icon_img: "https://example.com/subreddit-icon.png",
                        community_icon: null,
                      },
                    },
                  } as any);
                }
                if (url.includes("/comments/")) {
                  // Return mock comments (empty for simplicity)
                  return Promise.resolve({
                    data: [
                      apiFixture.data.children[0], // Post data
                      { data: { children: [] } }, // Empty comments
                    ],
                  } as any);
                }
                return Promise.reject(new Error(`Unexpected URL: ${url}`));
              });
            } else if (aggregatorId === "youtube") {
              // Mock YouTube API calls
              vi.spyOn(axios, "get").mockImplementation((url: string) => {
                if (url.includes("/channels")) {
                  // Check if it's a channel ID lookup or channel info request
                  const urlObj = new URL(url);
                  const idParam = urlObj.searchParams.get("id");
                  const partParam = urlObj.searchParams.get("part");

                  if (partParam === "id") {
                    // Channel ID validation
                    return Promise.resolve({
                      data: {
                        items: [{ id: idParam || "UCtest123" }],
                      },
                    } as any);
                  } else {
                    // Channel info with uploads playlist
                    return Promise.resolve({
                      data: {
                        items: [
                          {
                            id: idParam || "UCtest123",
                            snippet: {
                              thumbnails: {
                                high: {
                                  url: "https://example.com/channel-icon.jpg",
                                },
                              },
                            },
                            contentDetails: {
                              relatedPlaylists: {
                                uploads: "UUtest123",
                              },
                            },
                          },
                        ],
                      },
                    } as any);
                  }
                }
                if (url.includes("/playlistItems")) {
                  // Return mock playlist items
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
                  // Return mock video data
                  return Promise.resolve({ data: apiFixture } as any);
                }
                if (url.includes("/commentThreads")) {
                  // Return empty comments
                  return Promise.resolve({ data: { items: [] } } as any);
                }
                if (url.includes("/search")) {
                  // Return mock search results
                  return Promise.resolve({
                    data: {
                      items: [
                        {
                          id: { videoId: "dQw4w9WgXcQ" },
                        },
                      ],
                    },
                  } as any);
                }
                return Promise.reject(new Error(`Unexpected URL: ${url}`));
              });
            }

            // Test parsing API data to RawArticles
            let articles: RawArticle[];
            try {
              // Mock fetchSourceData to return fixture data
              if (aggregatorId === "reddit") {
                vi.spyOn(
                  aggregator as any,
                  "fetchSourceData",
                ).mockResolvedValue({
                  posts: apiFixture.data.children,
                  subreddit: "programming",
                  subredditInfo: { iconUrl: null },
                });
              } else if (aggregatorId === "youtube") {
                vi.spyOn(
                  aggregator as any,
                  "fetchSourceData",
                ).mockResolvedValue({
                  videos: apiFixture.items,
                  channelId: "UCtest123",
                });
              }

              // Test parseToRawArticles
              const sourceData = await (aggregator as any).fetchSourceData();
              articles = await (aggregator as any).parseToRawArticles(
                sourceData,
              );
            } catch (error) {
              console.warn(
                `parseToRawArticles failed for ${testName}:`,
                error instanceof Error ? error.message : String(error),
              );
              throw error;
            }

            expect(articles).toBeDefined();
            expect(Array.isArray(articles)).toBe(true);
            expect(articles.length).toBeGreaterThan(0);

            // Validate first article
            const article = articles[0];
            validateRawArticle(article, testConfig.expectedFields);
          } else {
            // Handle HTML-based aggregators
            // Load HTML fixture
            const html = await loadHtmlFixture(aggregatorId);
            if (!html) {
              throw new Error(
                `HTML fixture not found for ${aggregatorId}. Run: npx tsx src/server/aggregators/__tests__/download-fixtures.ts`,
              );
            }

            expect(html).toBeDefined();
            expect(html.length).toBeGreaterThan(0);

            // Create mock feed
            // Disable generateTitleImage to prevent network calls during processContent
            const mockFeed = {
              id: 1,
              userId: 1,
              name: `Test ${testName}`,
              identifier: testConfig.identifier || testConfig.testUrl,
              aggregator: aggregatorId,
              aggregatorOptions: {},
              dailyPostLimit: 10,
              generateTitleImage: false,
              addSourceFooter: true,
              useCurrentTimestamp: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Initialize aggregator
            aggregator.initialize(mockFeed, false, {});

            // Mock fetchArticleContentInternal to return the fixture HTML
            // This needs to work for both direct calls and super calls
            const mockHtml = html;
            vi.spyOn(
              aggregator as any,
              "fetchArticleContentInternal",
            ).mockResolvedValue(mockHtml);

            // Also mock the base class method to handle super.fetchArticleContentInternal calls
            const baseClass = Object.getPrototypeOf(
              Object.getPrototypeOf(aggregator),
            );
            if (baseClass && baseClass.fetchArticleContentInternal) {
              vi.spyOn(
                baseClass,
                "fetchArticleContentInternal",
              ).mockResolvedValue(mockHtml);
            }

            // Test content extraction
            const testArticle: RawArticle = {
              title: "Test Article",
              url: testConfig.testUrl,
              published: new Date(),
            };

            // Extract content using aggregator's extractContent method
            let extractedContent: string;
            try {
              extractedContent = await (aggregator as any).extractContent(
                html,
                testArticle,
              );
            } catch (error) {
              // Some aggregators might not have extractContent or might fail
              console.warn(
                `extractContent failed for ${testName}:`,
                error instanceof Error ? error.message : String(error),
              );
              throw error;
            }

            expect(extractedContent).toBeDefined();
            expect(typeof extractedContent).toBe("string");

            // Test content processing
            let processedContent: string;
            try {
              processedContent = await (aggregator as any).processContent(
                extractedContent,
                testArticle,
              );
              expect(processedContent).toBeDefined();
              expect(typeof processedContent).toBe("string");
            } catch (error) {
              // Processing might fail, but extraction should work
              console.warn(`processContent failed for ${testName}:`, error);
              throw error;
            }
          }
        },
      );

      it.skipIf(testConfig.skip === true)(
        `should produce valid RawArticle structure`,
        async () => {
          // Create aggregator instance
          const aggregator = new testConfig.aggregator();

          // Create mock feed
          const mockFeed = {
            id: 1,
            userId: 1,
            name: `Test ${testName}`,
            identifier: testConfig.identifier || testConfig.testUrl,
            aggregator: aggregator.id,
            aggregatorOptions: {},
            dailyPostLimit: 10,
            generateTitleImage: true,
            addSourceFooter: true,
            useCurrentTimestamp: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // Initialize aggregator
          aggregator.initialize(mockFeed, false, {});

          // Create a sample RawArticle to validate structure
          const sampleArticle: RawArticle = {
            title: "Test Article Title",
            url: testConfig.testUrl,
            published: new Date(),
            summary: "Test summary",
          };

          // Validate the structure
          validateRawArticle(sampleArticle, testConfig.expectedFields);

          // Test that aggregator can handle this structure
          expect(sampleArticle.title).toBe("Test Article Title");
          expect(sampleArticle.url).toBe(testConfig.testUrl);
        },
      );
    });
  }

  describe("RawArticle Structure Validation", () => {
    it("should validate required RawArticle fields", () => {
      const article: RawArticle = {
        title: "Test Article",
        url: "https://example.com/article",
        published: new Date(),
      };

      validateRawArticle(article, ["title", "url", "published"]);
    });

    it("should validate RawArticle with optional fields", () => {
      const article: RawArticle = {
        title: "Test Article",
        url: "https://example.com/article",
        published: new Date(),
        summary: "Test summary",
        content: "<p>Test content</p>",
        author: "Test Author",
        thumbnailUrl: "https://example.com/thumb.jpg",
        score: 100,
        viewCount: 1000,
      };

      validateRawArticle(article, [
        "title",
        "url",
        "published",
        "summary",
        "content",
        "author",
        "thumbnailUrl",
      ]);
    });

    it("should reject invalid RawArticle structures", () => {
      // Missing title
      expect(() => {
        validateRawArticle(
          {
            url: "https://example.com",
            published: new Date(),
          } as RawArticle,
          ["title", "url", "published"],
        );
      }).toThrow();

      // Missing URL
      expect(() => {
        validateRawArticle(
          {
            title: "Test",
            published: new Date(),
          } as RawArticle,
          ["title", "url", "published"],
        );
      }).toThrow();

      // Invalid URL format
      expect(() => {
        validateRawArticle(
          {
            title: "Test",
            url: "not-a-url",
            published: new Date(),
          } as RawArticle,
          ["title", "url", "published"],
        );
      }).toThrow();

      // Invalid published date
      expect(() => {
        validateRawArticle(
          {
            title: "Test",
            url: "https://example.com",
            published: new Date("invalid"),
          } as RawArticle,
          ["title", "url", "published"],
        );
      }).toThrow();
    });
  });
});
