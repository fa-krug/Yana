/**
 * Test fixtures.
 */

import type { User, Feed, Article } from "../../src/server/db/types";

export const testUser: Omit<User, "id" | "createdAt" | "updatedAt"> = {
  username: "testuser",
  email: "test@example.com",
  passwordHash: "$2b$10$testhash", // bcrypt hash for 'password'
  firstName: "",
  lastName: "",
  isSuperuser: false,
  isStaff: false,
};

export const testFeed: Omit<Feed, "id" | "createdAt" | "updatedAt"> = {
  userId: 1,
  name: "Test Feed",
  identifier: "https://example.com/feed.xml",
  aggregator: "full_website",
  feedType: "article",
  enabled: true,
  example: "",
  generateTitleImage: true,
  addSourceFooter: true,
  skipDuplicates: true,
  useCurrentTimestamp: true,
  dailyPostLimit: 50,
  aggregatorOptions: {},
  aiTranslateTo: "",
  aiSummarize: false,
  aiCustomPrompt: "",
  icon: null,
};

export const testArticle: Omit<Article, "id" | "createdAt" | "updatedAt"> = {
  feedId: 1,
  name: "Test Article",
  url: "https://example.com/article",
  date: new Date(),
  content: "<p>Test content</p>",
  author: null,
  externalId: null,
  score: null,
  thumbnailUrl: null,
  mediaUrl: null,
  duration: null,
  viewCount: null,
  mediaType: null,
  aiProcessed: false,
  aiError: "",
};
