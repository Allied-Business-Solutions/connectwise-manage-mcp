import { z } from 'zod';

/** Common pagination parameters shared by all list tools */
export const PaginationSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(1000).optional().default(25),
});

/** Common CWM query parameters shared by all list/search tools */
export const ListParamsSchema = PaginationSchema.extend({
  conditions: z.string().optional().describe('Raw CWM conditions string, e.g. status/name="Open" AND board/name="Help Desk MS"'),
  childconditions: z.string().optional().describe('Filters child collections within results'),
  customFieldConditions: z.string().optional().describe('Filter by custom fields, e.g. caption="X" AND value="Y"'),
  orderBy: z.string().optional().describe('Sort field and direction, e.g. "dateEntered desc"'),
  fields: z.string().optional().describe('Comma-separated sparse fieldset to return, e.g. "id,summary,status"'),
});

export type ListParams = z.infer<typeof ListParamsSchema>;

/** Standard tool response envelope */
export interface ToolSuccess<T> {
  ok: true;
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    count?: number;
    path?: string;
  };
}

export interface ToolError {
  ok: false;
  error: {
    code: string;
    message: string;
    httpStatus: number;
    details?: unknown[];
  };
}

export type ToolResult<T> = ToolSuccess<T> | ToolError;

export function success<T>(data: T, meta?: ToolSuccess<T>['meta']): ToolSuccess<T> {
  return { ok: true, data, ...(meta ? { meta } : {}) };
}

export function failure(error: { code: string; message: string; httpStatus: number; details?: unknown[] }): ToolError {
  return { ok: false, error };
}

/** Reference object schema (id + name) used throughout CWM */
export const ReferenceSchema = z.object({
  id: z.number(),
  name: z.string(),
});

/** Date range filter helper */
export const DateRangeSchema = z.object({
  dateFrom: z.string().optional().describe('ISO 8601 date, e.g. 2025-01-01'),
  dateTo: z.string().optional().describe('ISO 8601 date, e.g. 2025-12-31'),
});
