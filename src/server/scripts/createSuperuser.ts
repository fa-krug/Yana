/**
 * Create superuser script.
 *
 * Usage:
 *   tsx src/server/scripts/createSuperuser.ts <username> <email> <password>
 */

import { createUser, updateUserPassword } from '../services/user.service';
import { db, users } from '../db';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

async function createSuperuser(username: string, email: string, password: string) {
  try {
    // Check if user already exists
    const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);

    if (existing.length > 0) {
      // Update password and superuser status
      await updateUserPassword(existing[0].id, password);
      await db
        .update(users)
        .set({ isSuperuser: true, isStaff: true })
        .where(eq(users.id, existing[0].id));

      logger.info({ username }, 'User updated to superuser with new password');
      console.log(`User "${username}" updated to superuser with new password`);
    } else {
      // Create new superuser
      const user = await createUser(username, email, password);

      // Update to superuser
      await db.update(users).set({ isSuperuser: true, isStaff: true }).where(eq(users.id, user.id));

      logger.info({ username, userId: user.id }, 'Superuser created');
      console.log(`Superuser "${username}" created successfully`);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to create superuser');
    console.error('Error:', error);
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
  console.error('Usage: tsx createSuperuser.ts <username> <email> <password>');
  process.exit(1);
}

const [username, email, password] = args;

createSuperuser(username, email, password)
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
