/**
 * Pagination middleware and utilities.
 *
 * Provides pagination parsing and response formatting.
 */

import type { Request } from "express";

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Parse pagination parameters from request query.
 */
export function parsePagination<T extends Request = Request>(
  req: T,
): PaginationParams {
  const page = Math.max(1, parseInt((req.query["page"] as string) || "1") || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt((req.query["pageSize"] as string) || "20") || 20),
  );

  return { page, pageSize };
}

/**
 * Format paginated response.
 * Returns REST API PageNumberPagination compatible format.
 */
export function formatPaginatedResponse<T>(
  data: T[],
  total: number,
  pagination: PaginationParams,
): {
  items: T[];
  count: number;
  page: number;
  pageSize: number;
  pages: number;
} {
  return {
    items: data,
    count: total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    pages: Math.ceil(total / pagination.pageSize),
  };
}
