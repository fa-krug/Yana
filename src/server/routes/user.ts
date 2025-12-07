/**
 * User routes.
 *
 * Handles user profile and settings endpoints.
 */

import { Router } from 'express';
import type { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth, loadUser } from '../middleware/auth';
import { validateBody } from '../utils/validation';
import {
  updateUserSettingsSchema,
  updateProfileSchema,
  updatePasswordSchema,
} from '../validation/schemas';
import { getUserSettings, updateUserSettings } from '../services/userSettings.service';
import { getUserById, updateUserProfile } from '../services/user.service';
import { AuthenticationError } from '../errors';
import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Require authentication for all user routes
router.use(loadUser);
router.use(requireAuth);

/**
 * GET /api/v1/user/profile
 * Get user profile
 */
router.get(
  '/profile',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AuthenticationError('User not found in request');
    }

    const user = await getUserById(req.user.id);
    res.json({
      username: user.username,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email,
    });
  })
);

/**
 * PUT /api/v1/user/profile
 * Update user profile
 */
router.put(
  '/profile',
  validateBody(updateProfileSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AuthenticationError('User not found in request');
    }

    const user = await updateUserProfile(req.user.id, req.body);
    res.json({
      success: true,
      message: 'Profile updated successfully',
    });
  })
);

/**
 * GET /api/v1/user/settings
 * Get user settings
 */
router.get(
  '/settings',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AuthenticationError('User not found in request');
    }

    const settings = await getUserSettings(req.user.id);
    res.json(settings);
  })
);

/**
 * PUT /api/v1/user/settings
 * Update user settings
 */
router.put(
  '/settings',
  validateBody(updateUserSettingsSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AuthenticationError('User not found in request');
    }

    const settings = await updateUserSettings(req.user.id, req.body);
    res.json(settings);
  })
);

/**
 * GET /api/v1/user/settings/reddit
 * Get Reddit settings
 */
router.get(
  '/settings/reddit',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AuthenticationError('User not found in request');
    }

    const settings = await getUserSettings(req.user.id);
    res.json({
      enabled: settings.redditEnabled,
      clientId: settings.redditClientId,
      clientSecret: settings.redditClientSecret,
      userAgent: settings.redditUserAgent,
    });
  })
);

/**
 * PUT /api/v1/user/settings/reddit
 * Update Reddit settings
 */
router.put(
  '/settings/reddit',
  validateBody(
    updateUserSettingsSchema.pick({
      redditEnabled: true,
      redditClientId: true,
      redditClientSecret: true,
      redditUserAgent: true,
    })
  ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AuthenticationError('User not found in request');
    }

    await updateUserSettings(req.user.id, req.body);
    res.json({
      success: true,
      message: 'Reddit settings updated successfully',
    });
  })
);

/**
 * GET /api/v1/user/settings/youtube
 * Get YouTube settings
 */
router.get(
  '/settings/youtube',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AuthenticationError('User not found in request');
    }

    const settings = await getUserSettings(req.user.id);
    res.json({
      enabled: settings.youtubeEnabled,
      apiKey: settings.youtubeApiKey,
    });
  })
);

/**
 * PUT /api/v1/user/settings/youtube
 * Update YouTube settings
 */
router.put(
  '/settings/youtube',
  validateBody(
    updateUserSettingsSchema.pick({
      youtubeEnabled: true,
      youtubeApiKey: true,
    })
  ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AuthenticationError('User not found in request');
    }

    await updateUserSettings(req.user.id, req.body);
    res.json({
      success: true,
      message: 'YouTube settings updated successfully',
    });
  })
);

/**
 * GET /api/v1/user/settings/openai
 * Get OpenAI settings
 */
router.get(
  '/settings/openai',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AuthenticationError('User not found in request');
    }

    const settings = await getUserSettings(req.user.id);
    res.json({
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
    });
  })
);

/**
 * PUT /api/v1/user/settings/openai
 * Update OpenAI settings
 */
router.put(
  '/settings/openai',
  validateBody(
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
  ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AuthenticationError('User not found in request');
    }

    await updateUserSettings(req.user.id, req.body);
    res.json({
      success: true,
      message: 'OpenAI settings updated successfully',
    });
  })
);

/**
 * POST /api/v1/user/password
 * Change user password
 */
router.post(
  '/password',
  validateBody(updatePasswordSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AuthenticationError('User not found in request');
    }

    const { current_password, new_password } = req.body;
    const { updateUserPassword, authenticateUser } = await import('../services/user.service');

    // Verify current password
    try {
      await authenticateUser(req.user.username, current_password);
    } catch (error) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Update password
    await updateUserPassword(req.user.id, new_password);

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  })
);

export function userRoutes(): Router {
  return router;
}
