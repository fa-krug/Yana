/**
 * Admin user management routes.
 *
 * Handles user management endpoints for superusers.
 */

import { Router } from "express";
import type { Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, loadUser, requireSuperuser } from "../middleware/auth";
import { validateBody, validateQuery } from "../utils/validation";
import {
  adminUpdateUserSchema,
  adminCreateUserSchema,
  adminChangePasswordSchema,
  adminListUsersSchema,
} from "../validation/schemas";
import {
  createUser,
  getUserById,
  updateUserProfile,
  updateUserPassword,
  listUsers,
  updateUser,
  deleteUser,
} from "../services/user.service";
import {
  AuthenticationError,
  NotFoundError,
  PermissionDeniedError,
} from "../errors";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// Require authentication and superuser for all admin user routes
router.use(loadUser);
router.use(requireAuth);
router.use(requireSuperuser);

/**
 * GET /api/v1/admin/users
 * List all users with filters
 */
router.get(
  "/",
  validateQuery(adminListUsersSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const page = parseInt((req.query["page"] as string) || "1") || 1;
    const pageSize = parseInt((req.query["pageSize"] as string) || "50") || 50;
    const search = req.query["search"] as string | undefined;
    const isSuperuser = req.query["isSuperuser"]
      ? req.query["isSuperuser"] === "true"
      : undefined;

    const result = await listUsers({
      page,
      limit: pageSize,
      search,
      isSuperuser,
    });

    res.json(result);
  }),
);

/**
 * GET /api/v1/admin/users/:id
 * Get user by ID
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = parseInt(req.params["id"]);
    if (isNaN(userId)) {
      throw new NotFoundError("Invalid user ID");
    }

    const user = await getUserById(userId);
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      isSuperuser: user.isSuperuser,
      isStaff: user.isStaff,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }),
);

/**
 * POST /api/v1/admin/users
 * Create a new user
 */
router.post(
  "/",
  validateBody(adminCreateUserSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { username, email, password, firstName, lastName, isSuperuser } =
      req.body;

    const user = await createUser(username, email, password);

    // Update additional fields if provided
    if (
      firstName !== undefined ||
      lastName !== undefined ||
      isSuperuser !== undefined
    ) {
      const updateData: {
        firstName?: string;
        lastName?: string;
        isSuperuser?: boolean;
      } = {};

      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (isSuperuser !== undefined) updateData.isSuperuser = isSuperuser;

      await updateUser(user.id, updateData);
    }

    const updatedUser = await getUserById(user.id);
    res.status(201).json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      firstName: updatedUser.firstName || "",
      lastName: updatedUser.lastName || "",
      isSuperuser: updatedUser.isSuperuser,
      isStaff: updatedUser.isStaff,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    });
  }),
);

/**
 * PUT /api/v1/admin/users/:id
 * Update user profile
 */
router.put(
  "/:id",
  validateBody(adminUpdateUserSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = parseInt(req.params["id"]);
    if (isNaN(userId)) {
      throw new NotFoundError("Invalid user ID");
    }

    const { username, email, firstName, lastName, isSuperuser } = req.body;

    // Check if user exists
    await getUserById(userId);

    // Update profile fields if provided
    if (
      email !== undefined ||
      firstName !== undefined ||
      lastName !== undefined
    ) {
      await updateUserProfile(userId, {
        email: email || "",
        firstName,
        lastName,
      });
    }

    // Update username and superuser status if provided
    if (username !== undefined || isSuperuser !== undefined) {
      const updateData: {
        username?: string;
        isSuperuser?: boolean;
      } = {};

      if (username !== undefined) updateData.username = username;
      if (isSuperuser !== undefined) updateData.isSuperuser = isSuperuser;

      await updateUser(userId, updateData);
    }

    const updatedUser = await getUserById(userId);
    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      firstName: updatedUser.firstName || "",
      lastName: updatedUser.lastName || "",
      isSuperuser: updatedUser.isSuperuser,
      isStaff: updatedUser.isStaff,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    });
  }),
);

/**
 * POST /api/v1/admin/users/:id/password
 * Change user password (admin can change any user's password)
 */
router.post(
  "/:id/password",
  validateBody(adminChangePasswordSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = parseInt(req.params["id"]);
    if (isNaN(userId)) {
      throw new NotFoundError("Invalid user ID");
    }

    // Check if user exists
    await getUserById(userId);

    const { newPassword } = req.body;
    await updateUserPassword(userId, newPassword);

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  }),
);

/**
 * DELETE /api/v1/admin/users/:id
 * Delete user
 */
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = parseInt(req.params["id"]);
    if (isNaN(userId)) {
      throw new NotFoundError("Invalid user ID");
    }

    // Prevent users from deleting themselves
    if (req.user && userId === req.user.id) {
      throw new PermissionDeniedError("You cannot delete your own account");
    }

    await deleteUser(userId);

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  }),
);

export function adminUsersRoutes(): Router {
  return router;
}
