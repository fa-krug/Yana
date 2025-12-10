/**
 * Tests for aggregator router.
 *
 * These tests verify the tRPC aggregator endpoints work correctly
 * with the new Template Method Pattern aggregator architecture.
 */

import { describe, it, expect } from "vitest";
import { appRouter } from "../../router";
import { createContext } from "../../context";
import type { Request, Response } from "express";
import type { Session } from "express-session";

describe("Aggregator Router", () => {
  const createMockContext = async () => {
    const mockReq = {
      session: {
        id: "test-session-id",
        cookie: {},
        regenerate: () => {},
        destroy: () => {},
        reload: () => {},
        resetMaxAge: () => {},
        save: () => {},
        touch: () => {},
      } as unknown as Session,
    } as Request;

    const mockRes = {} as Response;

    return await createContext({ req: mockReq, res: mockRes });
  };

  it("should list all aggregators", async () => {
    const ctx = await createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.aggregator.list();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("should return grouped aggregators", async () => {
    const ctx = await createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.aggregator.grouped();

    expect(result).toHaveProperty("managed");
    expect(result).toHaveProperty("social");
    expect(result).toHaveProperty("custom");
    expect(Array.isArray(result.managed)).toBe(true);
    expect(Array.isArray(result.social)).toBe(true);
    expect(Array.isArray(result.custom)).toBe(true);
  });

  it("should get aggregator by id", async () => {
    const ctx = await createMockContext();
    const caller = appRouter.createCaller(ctx);

    // First get list to find a valid aggregator ID
    const list = await caller.aggregator.list();
    if (list.length > 0) {
      const aggregatorId = list[0].id;

      const result = await caller.aggregator.getById({ id: aggregatorId });

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("identifierType");
      expect(result).toHaveProperty("options");
    }
  });

  it("should get aggregator options", async () => {
    const ctx = await createMockContext();
    const caller = appRouter.createCaller(ctx);

    // First get list to find a valid aggregator ID
    const list = await caller.aggregator.list();
    if (list.length > 0) {
      const aggregatorId = list[0].id;

      const result = await caller.aggregator.getOptions({ id: aggregatorId });

      expect(result).toBeDefined();
      // Options can be empty object or undefined, both are valid
    }
  });
});
