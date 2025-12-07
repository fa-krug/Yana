/**
 * Main tRPC router.
 *
 * Combines all sub-routers into a single app router.
 */

import { router } from './procedures';
import { authRouter } from './routers/auth.router';
import { aggregatorRouter } from './routers/aggregator.router';
import { statisticsRouter } from './routers/statistics.router';
import { feedRouter } from './routers/feed.router';
import { articleRouter } from './routers/article.router';
import { userRouter } from './routers/user.router';
import { adminRouter } from './routers/admin.router';

/**
 * Main app router.
 * All sub-routers are now included.
 */
export const appRouter = router({
  auth: authRouter,
  aggregator: aggregatorRouter,
  statistics: statisticsRouter,
  feed: feedRouter,
  article: articleRouter,
  user: userRouter,
  admin: adminRouter,
});

/**
 * Export router type for use in client.
 */
export type AppRouter = typeof appRouter;
