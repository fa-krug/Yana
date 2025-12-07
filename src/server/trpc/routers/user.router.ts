/**
 * User router.
 *
 * Handles user profile and settings endpoints.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../procedures';
import { getAuthenticatedUser } from '../procedures';
import { getUserSettings, updateUserSettings } from '../../services/userSettings.service';
import {
  getUserById,
  updateUserProfile,
  updateUserPassword,
  authenticateUser,
} from '../../services/user.service';
import {
  updateUserSettingsSchema,
  updateProfileSchema,
  updatePasswordSchema,
} from '../../validation/schemas';
import { AuthenticationError } from '../../errors';
import { testRedditCredentials } from '../../services/reddit.service';
import { testYouTubeCredentials } from '../../services/youtube.service';
import { testOpenAICredentials } from '../../services/openai.service';

/**
 * User router.
 */
export const userRouter = router({
  /**
   * Get user profile.
   */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = getAuthenticatedUser(ctx);
    const dbUser = await getUserById(user.id);
    return {
      username: dbUser.username,
      firstName: dbUser.firstName || '',
      lastName: dbUser.lastName || '',
      email: dbUser.email,
    };
  }),

  /**
   * Update user profile.
   */
  updateProfile: protectedProcedure.input(updateProfileSchema).mutation(async ({ input, ctx }) => {
    const user = getAuthenticatedUser(ctx);
    await updateUserProfile(user.id, input);
    return {
      success: true,
      message: 'Profile updated successfully',
    };
  }),

  /**
   * Get user settings.
   */
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const user = getAuthenticatedUser(ctx);
    return await getUserSettings(user.id);
  }),

  /**
   * Update user settings.
   */
  updateSettings: protectedProcedure
    .input(updateUserSettingsSchema)
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      return await updateUserSettings(user.id, input);
    }),

  /**
   * Get Reddit settings.
   */
  getRedditSettings: protectedProcedure.query(async ({ ctx }) => {
    const user = getAuthenticatedUser(ctx);
    const settings = await getUserSettings(user.id);
    return {
      enabled: settings.redditEnabled,
      clientId: settings.redditClientId,
      clientSecret: settings.redditClientSecret,
      userAgent: settings.redditUserAgent,
    };
  }),

  /**
   * Update Reddit settings.
   */
  updateRedditSettings: protectedProcedure
    .input(
      updateUserSettingsSchema.pick({
        redditEnabled: true,
        redditClientId: true,
        redditClientSecret: true,
        redditUserAgent: true,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);

      // Get existing settings to handle case where secret wasn't changed
      const existingSettings = await getUserSettings(user.id);

      // If Reddit is enabled, test credentials before saving
      if (input.redditEnabled) {
        const clientSecret =
          input.redditClientSecret && input.redditClientSecret.trim() !== ''
            ? input.redditClientSecret
            : existingSettings.redditClientSecret;

        // Test credentials
        const testResult = await testRedditCredentials({
          clientId: input.redditClientId || '',
          clientSecret: clientSecret || '',
          userAgent: input.redditUserAgent || 'Yana/1.0',
        });

        if (!testResult.success && testResult.errors) {
          // Throw TRPCError with field-specific errors
          // Attach field errors to error object for serialization in errorFormatter
          const error = new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Reddit credentials validation failed',
            cause: testResult.errors,
          });
          (error as any).fieldErrors = testResult.errors;
          throw error;
        }
      }

      // Prepare updates - preserve existing secret if new one is empty
      const updates: typeof input = { ...input };
      if (!updates.redditClientSecret || updates.redditClientSecret.trim() === '') {
        // Don't update secret if it's empty (preserve existing)
        delete updates.redditClientSecret;
      }

      // Save settings if test passed or Reddit is disabled
      await updateUserSettings(user.id, updates);
      return {
        success: true,
        message: 'Reddit settings updated successfully',
      };
    }),

  /**
   * Get YouTube settings.
   */
  getYouTubeSettings: protectedProcedure.query(async ({ ctx }) => {
    const user = getAuthenticatedUser(ctx);
    const settings = await getUserSettings(user.id);
    return {
      enabled: settings.youtubeEnabled,
      apiKey: settings.youtubeApiKey,
    };
  }),

  /**
   * Update YouTube settings.
   */
  updateYouTubeSettings: protectedProcedure
    .input(
      updateUserSettingsSchema.pick({
        youtubeEnabled: true,
        youtubeApiKey: true,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);

      // Get existing settings to handle case where API key wasn't changed
      const existingSettings = await getUserSettings(user.id);

      // If YouTube is enabled, test credentials before saving
      if (input.youtubeEnabled) {
        const apiKey =
          input.youtubeApiKey && input.youtubeApiKey.trim() !== ''
            ? input.youtubeApiKey
            : existingSettings.youtubeApiKey;

        // Test credentials
        const testResult = await testYouTubeCredentials({
          apiKey: apiKey || '',
        });

        if (!testResult.success && testResult.errors) {
          // Throw TRPCError with field-specific errors
          // Attach field errors to error object for serialization in errorFormatter
          const error = new TRPCError({
            code: 'BAD_REQUEST',
            message: 'YouTube credentials validation failed',
            cause: testResult.errors,
          });
          (error as any).fieldErrors = testResult.errors;
          throw error;
        }
      }

      // Prepare updates - preserve existing API key if new one is empty
      const updates: typeof input = { ...input };
      if (!updates.youtubeApiKey || updates.youtubeApiKey.trim() === '') {
        // Don't update API key if it's empty (preserve existing)
        delete updates.youtubeApiKey;
      }

      // Save settings if test passed or YouTube is disabled
      await updateUserSettings(user.id, updates);
      return {
        success: true,
        message: 'YouTube settings updated successfully',
      };
    }),

  /**
   * Get OpenAI settings.
   */
  getOpenAISettings: protectedProcedure.query(async ({ ctx }) => {
    const user = getAuthenticatedUser(ctx);
    const settings = await getUserSettings(user.id);
    return {
      enabled: settings.openaiEnabled,
      apiUrl: settings.openaiApiUrl,
      apiKey: settings.openaiApiKey,
      model: settings.aiModel,
      temperature: settings.aiTemperature,
      maxTokens: settings.aiMaxTokens,
      defaultDailyLimit: settings.aiDefaultDailyLimit,
      defaultMonthlyLimit: settings.aiDefaultMonthlyLimit,
      maxPromptLength: settings.aiMaxPromptLength,
      requestTimeout: settings.aiRequestTimeout,
      maxRetries: settings.aiMaxRetries,
      retryDelay: settings.aiRetryDelay,
    };
  }),

  /**
   * Update OpenAI settings.
   */
  updateOpenAISettings: protectedProcedure
    .input(
      updateUserSettingsSchema.pick({
        openaiEnabled: true,
        openaiApiUrl: true,
        openaiApiKey: true,
        aiModel: true,
        aiTemperature: true,
        aiMaxTokens: true,
        aiDefaultDailyLimit: true,
        aiDefaultMonthlyLimit: true,
        aiMaxPromptLength: true,
        aiRequestTimeout: true,
        aiMaxRetries: true,
        aiRetryDelay: true,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);

      // Get existing settings to handle case where API key wasn't changed
      const existingSettings = await getUserSettings(user.id);

      // If OpenAI is enabled, test credentials before saving
      if (input.openaiEnabled) {
        const apiKey =
          input.openaiApiKey && input.openaiApiKey.trim() !== ''
            ? input.openaiApiKey
            : existingSettings.openaiApiKey;

        // Test credentials
        const testResult = await testOpenAICredentials({
          apiUrl:
            input.openaiApiUrl || existingSettings.openaiApiUrl || 'https://api.openai.com/v1',
          apiKey: apiKey || '',
        });

        if (!testResult.success && testResult.errors) {
          // Throw TRPCError with field-specific errors
          // Attach field errors to error object for serialization in errorFormatter
          const error = new TRPCError({
            code: 'BAD_REQUEST',
            message: 'OpenAI credentials validation failed',
            cause: testResult.errors,
          });
          (error as any).fieldErrors = testResult.errors;
          throw error;
        }
      }

      // Prepare updates - preserve existing API key if new one is empty
      const updates: typeof input = { ...input };
      if (!updates.openaiApiKey || updates.openaiApiKey.trim() === '') {
        // Don't update API key if it's empty (preserve existing)
        delete updates.openaiApiKey;
      }

      // Save settings if test passed or OpenAI is disabled
      await updateUserSettings(user.id, updates);
      return {
        success: true,
        message: 'OpenAI settings updated successfully',
      };
    }),

  /**
   * Change user password.
   */
  changePassword: protectedProcedure
    .input(updatePasswordSchema)
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      const { current_password, new_password } = input;

      // Verify current password
      try {
        await authenticateUser(user.username, current_password);
      } catch (error) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Current password is incorrect',
        });
      }

      // Update password
      await updateUserPassword(user.id, new_password);

      return {
        success: true,
        message: 'Password changed successfully',
      };
    }),
});
