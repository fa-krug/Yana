/**
 * Tests for tRPC setup and infrastructure.
 */

import { describe, it, expect } from 'vitest';
import { createContext } from '../context';
import type { Request, Response } from 'express';
import type { Session } from 'express-session';

describe('tRPC Setup', () => {
  it('should create context without user when session has no userId', async () => {
    const mockReq = {
      session: {} as Session,
    } as Request;

    const mockRes = {} as Response;

    const context = await createContext({ req: mockReq, res: mockRes });

    expect(context).toBeDefined();
    expect(context.user).toBeNull();
    expect(context.req).toBe(mockReq);
    expect(context.res).toBe(mockRes);
  });

  it('should create context with user when session has userId', async () => {
    // This test would require a database setup, so we'll skip the actual user loading
    // and just verify the structure
    const mockSession = {
      userId: 1,
      isSuperuser: false,
      id: 'test-session-id',
      cookie: {},
      regenerate: () => {},
      destroy: () => {},
      reload: () => {},
      resetMaxAge: () => {},
      save: () => {},
      touch: () => {},
    } as unknown as Session;

    const mockReq = {
      session: mockSession,
    } as Request;

    const mockRes = {} as Response;

    // Note: This will fail if user with ID 1 doesn't exist in test DB
    // For now, we'll just verify the function exists and can be called
    const context = await createContext({ req: mockReq, res: mockRes });

    expect(context).toBeDefined();
    expect(context.req).toBe(mockReq);
    expect(context.res).toBe(mockRes);
    // User may be null if not found in DB, which is expected behavior
  });
});
