/**
 * Statistics router.
 *
 * Handles statistics endpoints.
 */

import { router, protectedProcedure } from "../procedures";
import { getStatistics } from "../../services/statistics.service";
import { getAuthenticatedUser } from "../procedures";

/**
 * Statistics router.
 */
export const statisticsRouter = router({
  /**
   * Get dashboard statistics for the current user.
   * Cached for 60 seconds per user to reduce database load.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = getAuthenticatedUser(ctx);
    return await getStatistics(user);
  }),
});
