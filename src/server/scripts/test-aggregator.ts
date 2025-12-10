/**
 * Test aggregator script.
 *
 * Tests all aggregators against a specific article URL to help with debugging.
 *
 * Usage:
 *   npm run test:aggregator <url>
 *
 * Example:
 *   npm run test:aggregator https://example.com/article
 */

import { getAllAggregators, getAggregatorById } from "../aggregators/registry";
import type { RawArticle } from "../aggregators/base/types";
import { logger } from "../utils/logger";

interface TestResult {
  aggregatorId: string;
  aggregatorName: string;
  success: boolean;
  error?: string;
  contentLength?: number;
  processingTime?: number;
  canFetch?: boolean;
  canExtract?: boolean;
  canProcess?: boolean;
  extractedLength?: number;
  processedLength?: number;
}

/**
 * Test a single aggregator against a URL.
 */
async function testAggregator(
  aggregatorId: string,
  url: string,
): Promise<TestResult> {
  const startTime = Date.now();
  const aggregator = getAggregatorById(aggregatorId);

  if (!aggregator) {
    return {
      aggregatorId,
      aggregatorName: aggregatorId,
      success: false,
      error: "Aggregator not found",
    };
  }

  const result: TestResult = {
    aggregatorId,
    aggregatorName: aggregator.name,
    success: false,
  };

  try {
    // Create a mock feed for testing
    const mockFeed = {
      id: 1,
      userId: 1,
      name: "Test Feed",
      identifier: url,
      feedType: "article" as const,
      icon: null,
      example: "",
      aggregator: aggregatorId,
      enabled: true,
      generateTitleImage: true,
      addSourceFooter: true,
      skipDuplicates: true,
      useCurrentTimestamp: false,
      dailyPostLimit: 10,
      aggregatorOptions: {},
      aiTranslateTo: "",
      aiSummarize: false,
      aiCustomPrompt: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Initialize aggregator
    aggregator.initialize(mockFeed, true, {});

    // Create a mock article
    const mockArticle: RawArticle = {
      title: "Test Article",
      url,
      published: new Date(),
      summary: "Test summary",
    };

    // Test fetchArticleContentInternal (protected method)
    let html: string | null = null;
    try {
      html = await (aggregator as any).fetchArticleContentInternal(
        url,
        mockArticle,
      );
      result.canFetch = true;
    } catch (error) {
      result.canFetch = false;
      result.error = `Fetch failed: ${error instanceof Error ? error.message : String(error)}`;
      result.processingTime = Date.now() - startTime;
      return result;
    }

    if (!html) {
      result.error = "Fetched HTML is null";
      result.processingTime = Date.now() - startTime;
      return result;
    }

    // Test extractContent and processContent (template method flow)
    let processed: string | null = null;
    try {
      const extracted = await (aggregator as any).extractContent(
        html,
        mockArticle,
      );
      result.canExtract = true;
      result.extractedLength = extracted.length;
      processed = await (aggregator as any).processContent(
        extracted,
        mockArticle,
      );
      result.canProcess = true;
      if (processed) {
        result.processedLength = processed.length;
        result.contentLength = processed.length;
      } else {
        result.error = "Processed content is null";
        result.processingTime = Date.now() - startTime;
        return result;
      }
    } catch (error) {
      result.canExtract = false;
      result.canProcess = false;
      result.error = `Process failed: ${error instanceof Error ? error.message : String(error)}`;
      result.processingTime = Date.now() - startTime;
      return result;
    }

    result.success = true;
    result.processingTime = Date.now() - startTime;
  } catch (error) {
    result.success = false;
    result.error = error instanceof Error ? error.message : String(error);
    result.processingTime = Date.now() - startTime;
  }

  return result;
}

/**
 * Format test results for display.
 */
function formatResults(results: TestResult[]): string {
  const lines: string[] = [];
  lines.push("\n" + "=".repeat(80));
  lines.push("AGGREGATOR TEST RESULTS");
  lines.push("=".repeat(80));
  lines.push("");

  for (const result of results) {
    lines.push(`Aggregator: ${result.aggregatorName} (${result.aggregatorId})`);
    lines.push(`  Status: ${result.success ? "✓ SUCCESS" : "✗ FAILED"}`);
    if (result.error) {
      lines.push(`  Error: ${result.error}`);
    }
    if (result.canFetch !== undefined) {
      lines.push(`  Can Fetch: ${result.canFetch ? "✓" : "✗"}`);
    }
    if (result.canExtract !== undefined) {
      lines.push(`  Can Extract: ${result.canExtract ? "✓" : "✗"}`);
    }
    if (result.canProcess !== undefined) {
      lines.push(`  Can Process: ${result.canProcess ? "✓" : "✗"}`);
    }
    if (result.extractedLength !== undefined) {
      lines.push(`  Extracted Length: ${result.extractedLength} chars`);
    }
    if (result.processedLength !== undefined) {
      lines.push(`  Processed Length: ${result.processedLength} chars`);
    }
    if (result.contentLength !== undefined) {
      lines.push(`  Final Content Length: ${result.contentLength} chars`);
    }
    if (result.processingTime !== undefined) {
      lines.push(`  Processing Time: ${result.processingTime}ms`);
    }
    lines.push("");
  }

  // Summary
  const successCount = results.filter((r) => r.success).length;
  const totalCount = results.length;
  lines.push("=".repeat(80));
  lines.push(`SUMMARY: ${successCount}/${totalCount} aggregators succeeded`);
  lines.push("=".repeat(80));
  lines.push("");

  return lines.join("\n");
}

/**
 * Main function.
 */
async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error("Usage: npm run test:aggregator <url>");
    console.error(
      "Example: npm run test:aggregator https://example.com/article",
    );
    process.exit(1);
  }

  console.log(`Testing all aggregators against URL: ${url}\n`);

  // Get all aggregators
  const aggregators = getAllAggregators();
  console.log(`Found ${aggregators.length} aggregators\n`);

  // Test each aggregator
  const results: TestResult[] = [];
  for (const aggregator of aggregators) {
    console.log(`Testing ${aggregator.name} (${aggregator.id})...`);
    const result = await testAggregator(aggregator.id, url);
    results.push(result);
  }

  // Display results
  console.log(formatResults(results));

  // Exit with error code if any failed
  const failedCount = results.filter((r) => !r.success).length;
  if (failedCount > 0) {
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { testAggregator, formatResults };
