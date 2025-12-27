/**
 * Script to download HTML fixtures for aggregator tests.
 * Fetches RSS feeds to get real article URLs, then downloads article HTML.
 *
 * Usage: npx tsx src/server/aggregators/__tests__/download-fixtures.ts
 */

import * as fs from "fs/promises";
import * as path from "path";

import { chromium, type Browser } from "playwright";

import { fetchFeed } from "../base/fetch";

/**
 * RSS feed URLs for each aggregator.
 * We'll fetch the feed, get the first article URL, then download its HTML.
 */
const AGGREGATOR_FIXTURES: Array<{
  aggregatorId: string;
  aggregatorName: string;
  feedUrl: string;
  skip?: boolean;
}> = [
  {
    aggregatorId: "heise",
    aggregatorName: "Heise",
    feedUrl: "https://www.heise.de/rss/heise.rdf",
  },
  {
    aggregatorId: "merkur",
    aggregatorName: "Merkur",
    feedUrl: "https://www.merkur.de/rssfeed.rdf",
  },
  {
    aggregatorId: "tagesschau",
    aggregatorName: "Tagesschau",
    feedUrl: "https://www.tagesschau.de/xml/rss2/",
  },
  {
    aggregatorId: "explosm",
    aggregatorName: "Explosm",
    feedUrl: "https://explosm.net/rss.xml",
  },
  {
    aggregatorId: "mactechnews",
    aggregatorName: "MacTechNews",
    feedUrl: "https://www.mactechnews.de/Rss/News.x",
  },
  {
    aggregatorId: "caschys_blog",
    aggregatorName: "CaschysBlog",
    feedUrl: "https://caschys.blog/feed/",
  },
  {
    aggregatorId: "dark_legacy",
    aggregatorName: "DarkLegacy",
    feedUrl: "https://darklegacycomics.com/feed.xml",
  },
  {
    aggregatorId: "mein_mmo",
    aggregatorName: "MeinMmo",
    feedUrl: "https://www.mein-mmo.de/feed/",
  },
  // Try aggregators that might work
  {
    aggregatorId: "oglaf",
    aggregatorName: "Oglaf",
    feedUrl: "https://www.oglaf.com/feeds/rss/",
    // Oglaf handles age confirmation automatically in its fetchArticleContentInternal
  },
  {
    aggregatorId: "full_website",
    aggregatorName: "FullWebsite",
    feedUrl: "https://www.heise.de/rss/heise.rdf", // Use a real feed for testing
  },
  {
    aggregatorId: "feed_content",
    aggregatorName: "FeedContent",
    feedUrl: "https://www.heise.de/rss/heise.rdf", // Use a real feed for testing
  },
  {
    aggregatorId: "podcast",
    aggregatorName: "Podcast",
    feedUrl: "https://feeds.npr.org/510289/podcast.xml", // NPR podcast feed for testing
  },
  {
    aggregatorId: "reddit",
    aggregatorName: "Reddit",
    feedUrl: "https://www.reddit.com/r/programming/",
    // Will create mock API fixture instead of fetching
  },
  {
    aggregatorId: "youtube",
    aggregatorName: "YouTube",
    feedUrl: "https://www.youtube.com/@example",
    // Will create mock API fixture instead of fetching
  },
];

const FIXTURES_DIR = path.join(__dirname, "fixtures");

/**
 * Download HTML content from a URL using Playwright.
 */
async function downloadHtml(
  browser: Browser,
  url: string,
  timeout: number = 30000,
  waitForSelector?: string,
): Promise<string> {
  const page = await browser.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    // Handle Oglaf age confirmation
    if (url.includes("oglaf.com")) {
      const confirmButton = await page
        .waitForSelector("#confirm", { timeout: 5000 })
        .catch(() => null);

      if (confirmButton) {
         
        await Promise.all([
          page
            .waitForNavigation({ waitUntil: "networkidle", timeout })
            .catch(() => {}),
          confirmButton.click(),
        ]).catch(() => {});
      }

      // Wait for comic content
      await page
        .waitForSelector("#strip, .content img, #content img, .comic img", {
          timeout,
          state: "attached",
        })
        .catch(() => {});
    }

    // Wait for specific selector if provided
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout }).catch(() => {});
    }

    const html = await page.content();
    await page.close();
    return html;
  } catch (error) {
    await page.close();
    throw error;
  }
}

/**
 * Get the first article URL from an RSS feed.
 */
async function getFirstArticleUrl(feedUrl: string): Promise<string | null> {
  try {
    const feed = await fetchFeed(feedUrl);
    const items = feed.items || [];
    if (items.length === 0) {
      return null;
    }
    // Get the first item's link
    const firstItem = items[0];
    return firstItem.link || null;
  } catch (error) {
    console.error(
      `Failed to fetch RSS feed ${feedUrl}:`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * Main function.
 */
async function main(): Promise<void> {
  console.log("Downloading HTML fixtures for aggregator tests...\n");

  // Ensure fixtures directory exists
  await fs.mkdir(FIXTURES_DIR, { recursive: true });

  // Launch browser
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    for (const fixture of AGGREGATOR_FIXTURES) {
      if (fixture.skip) {
        console.log(
          `⏭️  Skipping ${fixture.aggregatorName} (${fixture.aggregatorId})`,
        );
        continue;
      }

      const filePath = path.join(FIXTURES_DIR, `${fixture.aggregatorId}.html`);

      try {
        // Special handling for API-based aggregators
        if (fixture.aggregatorId === "reddit") {
          // Create mock Reddit API response fixture
          const redditApiFixture = {
            data: {
              children: [
                {
                  data: {
                    id: "test123",
                    title: "Test Reddit Post Title",
                    selftext:
                      "This is a test self post with some content.\n\nIt has multiple paragraphs and **markdown formatting**.",
                    selftext_html:
                      '<div class="md"><p>This is a test self post with some content.</p>\n<p>It has multiple paragraphs and <strong>markdown formatting</strong>.</p>\n</div>',
                    url: "https://example.com/link",
                    permalink:
                      "/r/programming/comments/test123/test_reddit_post_title/",
                    created_utc: Math.floor(Date.now() / 1000),
                    author: "testuser",
                    score: 1234,
                    num_comments: 56,
                    thumbnail: "https://example.com/thumbnail.jpg",
                    preview: {
                      images: [
                        {
                          source: {
                            url: "https://example.com/image.jpg",
                            width: 1920,
                            height: 1080,
                          },
                        },
                      ],
                    },
                    is_self: true,
                    is_gallery: false,
                    is_video: false,
                  },
                },
              ],
            },
          };
          const apiFilePath = path.join(
            FIXTURES_DIR,
            `${fixture.aggregatorId}-api.json`,
          );
          await fs.writeFile(
            apiFilePath,
            JSON.stringify(redditApiFixture, null, 2),
            "utf-8",
          );
          console.log(
            `✅ Saved ${fixture.aggregatorName} API fixture to ${apiFilePath}`,
          );
          continue;
        }

        if (fixture.aggregatorId === "youtube") {
          // Create mock YouTube API response fixture
          const youtubeApiFixture = {
            items: [
              {
                id: "dQw4w9WgXcQ",
                snippet: {
                  title: "Test YouTube Video Title",
                  description:
                    "This is a test YouTube video description with some content.\n\nIt has multiple lines and formatting.",
                  publishedAt: new Date().toISOString(),
                  channelId: "UCtest123",
                  channelTitle: "Test Channel",
                  thumbnails: {
                    default: {
                      url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
                      width: 120,
                      height: 90,
                    },
                    medium: {
                      url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
                      width: 320,
                      height: 180,
                    },
                    high: {
                      url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                      width: 480,
                      height: 360,
                    },
                  },
                },
                statistics: {
                  viewCount: "1000000",
                  likeCount: "50000",
                  commentCount: "5000",
                },
                contentDetails: {
                  duration: "PT3M33S",
                },
              },
            ],
          };
          const apiFilePath = path.join(
            FIXTURES_DIR,
            `${fixture.aggregatorId}-api.json`,
          );
          await fs.writeFile(
            apiFilePath,
            JSON.stringify(youtubeApiFixture, null, 2),
            "utf-8",
          );
          console.log(
            `✅ Saved ${fixture.aggregatorName} API fixture to ${apiFilePath}`,
          );
          continue;
        }

        // Step 1: Fetch RSS feed to get article URL
        console.log(
          `📡 Fetching RSS feed for ${fixture.aggregatorName} (${fixture.aggregatorId}) from ${fixture.feedUrl}...`,
        );
        const articleUrl = await getFirstArticleUrl(fixture.feedUrl);

        if (!articleUrl) {
          console.error(
            `❌ No articles found in RSS feed for ${fixture.aggregatorName}`,
          );
          continue;
        }

        console.log(`📄 Found article: ${articleUrl}`);

        // Step 2: Download article HTML using Playwright
        console.log(`📥 Downloading ${fixture.aggregatorName} article HTML...`);

        // Get waitForSelector if this is Oglaf
        const waitForSelector =
          fixture.aggregatorId === "oglaf"
            ? "#strip, .content img, #content img, .comic img"
            : undefined;

        const html = await downloadHtml(
          browser,
          articleUrl,
          30000,
          waitForSelector,
        );
        await fs.writeFile(filePath, html, "utf-8");
        console.log(
          `✅ Saved ${fixture.aggregatorName} HTML (${html.length} bytes) to ${filePath}`,
        );
      } catch (error) {
        console.error(
          `❌ Failed to download ${fixture.aggregatorName}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  } finally {
    await browser.close();
  }

  console.log("\n✅ Fixture download complete!");
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Error downloading fixtures:", error);
    process.exit(1);
  });
}
