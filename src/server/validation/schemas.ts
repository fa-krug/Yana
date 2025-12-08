/**
 * Zod validation schemas for API endpoints.
 *
 * Provides type-safe validation for all API inputs.
 */

import { z } from "zod";
import { commonSchemas } from "../utils/validation";

// User schemas
export const createUserSchema = z.object({
  username: z.string().min(3).max(150),
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const updatePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
  confirm_password: z.string().min(8).optional(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email(),
});

// Admin user management schemas
export const adminUpdateUserSchema = z.object({
  username: z.string().min(3).max(150).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  isSuperuser: z.boolean().optional(),
});

export const adminCreateUserSchema = z.object({
  username: z.string().min(3).max(150),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  isSuperuser: z.boolean().optional().default(false),
});

export const adminChangePasswordSchema = z.object({
  newPassword: z.string().min(8),
});

export const adminListUsersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  isSuperuser: z.coerce.boolean().optional(),
});

// Admin tasks schemas
export const taskListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .array(z.enum(["pending", "running", "completed", "failed"]))
    .optional(),
  type: z.array(z.string()).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

// Feed schemas
export const createFeedSchema = z.object({
  name: z.string().min(1).max(255),
  identifier: z.string().min(1).max(500),
  feedType: z
    .enum(["article", "youtube", "podcast", "reddit"])
    .default("article"),
  aggregator: z.string().min(1).max(255),
  enabled: z.boolean().default(true),
  generateTitleImage: z.boolean().default(true),
  addSourceFooter: z.boolean().default(true),
  skipDuplicates: z.boolean().default(true),
  useCurrentTimestamp: z.boolean().default(true),
  dailyPostLimit: z.number().int().default(50),
  aggregatorOptions: z.record(z.string(), z.unknown()).default({}),
  aiTranslateTo: z.string().max(10).default(""),
  aiSummarize: z.boolean().default(false),
  aiCustomPrompt: z.string().max(500).default(""),
  icon: z
    .union([z.string().url(), z.literal(""), z.null()])
    .optional()
    .transform((val) => (val === "" ? null : val)),
  example: z.string().default(""),
});

export const updateFeedSchema = createFeedSchema.partial();

// Article schemas
export const markArticlesSchema = z.object({
  articleIds: z.array(z.number().int().positive()).min(1),
  isRead: z.boolean().optional(),
  isSaved: z.boolean().optional(),
});

export const articleListSchema = z.object({
  ...commonSchemas.pagination.shape,
  feedId: z.coerce.number().int().positive().optional(),
  feedType: z.enum(["article", "youtube", "podcast", "reddit"]).optional(),
  isRead: z.coerce.boolean().optional(),
  isSaved: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

// User settings schemas
export const updateUserSettingsSchema = z.object({
  redditEnabled: z.boolean().optional(),
  redditClientId: z.string().optional(),
  redditClientSecret: z.string().optional(),
  redditUserAgent: z.string().optional(),
  youtubeEnabled: z.boolean().optional(),
  youtubeApiKey: z.string().optional(),
  openaiEnabled: z.boolean().optional(),
  openaiApiUrl: z.string().url().optional(),
  openaiApiKey: z.string().optional(),
  aiModel: z.string().optional(),
  aiTemperature: z.number().min(0).max(2).optional(),
  aiMaxTokens: z.number().int().positive().optional(),
  aiDefaultDailyLimit: z.number().int().positive().optional(),
  aiDefaultMonthlyLimit: z.number().int().positive().optional(),
  aiMaxPromptLength: z.number().int().positive().optional(),
  aiRequestTimeout: z.number().int().positive().optional(),
  aiMaxRetries: z.number().int().positive().optional(),
  aiRetryDelay: z.number().int().positive().optional(),
});

// Common schemas
export const idParamSchema = z.object({
  id: commonSchemas.id,
});

export const feedIdParamSchema = z.object({
  feedId: commonSchemas.id,
});
