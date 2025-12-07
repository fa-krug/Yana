/**
 * AI status routes.
 *
 * Provides AI feature availability status.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

/**
 * GET /api/ai-status
 * Get AI feature availability status
 */
router.get('/ai-status', (req: Request, res: Response) => {
  const aiEnabled = process.env['AI_ENABLED'] === 'true';
  const aiModel = aiEnabled ? process.env['AI_MODEL'] || null : null;

  res.json({
    ai_enabled: aiEnabled,
    ai_model: aiModel,
  });
});

export function aiRoutes(): Router {
  return router;
}
