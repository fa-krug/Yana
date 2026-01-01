/**
 * Create superuser script.
 *
 * Usage:
 *   tsx src/server/scripts/createSuperuser.ts <username> <email> <password>
 */

import { eq } from "drizzle-orm";

import { db, users } from "../db";
import { createUser } from "../services/user.service";
import { logger } from "../utils/logger";

async function createSuperuser(
  username: string,
  email: string,
  password: string,
) {
  try {
    // Check if user already exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existing.length > 0) {
      // User already exists - do nothing
      logger.info(
        { username, userId: existing[0].id },
        "User already exists, skipping creation",
      );
      console.log(
        `User "${username}" already exists, skipping superuser creation`,
      );
    } else {
      // Create new superuser
      const user = await createUser(username, email, password);

      // Update to superuser
      await db
        .update(users)
        .set({ isSuperuser: true, isStaff: true })
        .where(eq(users.id, user.id));

      logger.info({ username, userId: user.id }, "Superuser created");
      console.log(`Superuser "${username}" created successfully`);
    }
  } catch (error) {
    logger.error({ error }, "Failed to create superuser");
    console.error("Error:", error);
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
  console.error("Usage: tsx createSuperuser.ts <username> <email> <password>");
  process.exit(1);
}

const [username, email, password] = args;

createSuperuser(username, email, password)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
