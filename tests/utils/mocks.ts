/**
 * Mock utilities for testing.
 */

import { vi } from "vitest";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../src/server/middleware/auth";
import type { User } from "../../src/server/db/types";

/**
 * Create a mock Express request.
 */
export function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    path: "/",
    query: {},
    params: {},
    body: {},
    headers: {},
    cookies: {},
    session: {},
    user: undefined,
    ...overrides,
  } as Request;
}

/**
 * Create a mock authenticated request.
 */
export function createMockAuthenticatedRequest(
  user: User,
  overrides: Partial<AuthenticatedRequest> = {},
): AuthenticatedRequest {
  return {
    ...createMockRequest(),
    user,
    ...overrides,
  } as AuthenticatedRequest;
}

/**
 * Create a mock Express response.
 */
export function createMockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    sendFile: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return res;
}
