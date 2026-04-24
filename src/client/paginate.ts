import { cwmGet, QueryParams } from './cwmClient.js';
import { logger } from '../utils/logger.js';

export interface PageOptions {
  page?: number;
  pageSize?: number;
  conditions?: string;
  orderBy?: string;
  fields?: string;
}

export interface PageResult<T> {
  data: T[];
  page: number;
  pageSize: number;
}

/**
 * Fetch a single page from a CWM list endpoint.
 */
export async function fetchPage<T>(path: string, opts: PageOptions & QueryParams = {}): Promise<PageResult<T>> {
  const { page = 1, pageSize = 25, ...rest } = opts;
  const response = await cwmGet<T[]>(path, { page, pageSize, ...rest });
  return { data: response.data, page, pageSize };
}

/**
 * Fetch ALL records across pages, following CWM pagination.
 * Stops when an empty page is returned or maxPages is reached.
 *
 * @param maxPages - Safety cap, default from env or 20
 */
export async function paginateAll<T>(
  path: string,
  opts: Omit<PageOptions, 'page'> & QueryParams & { maxPages?: number } = {}
): Promise<T[]> {
  const { maxPages = parseInt(process.env['CWM_MAX_PAGES'] ?? '20', 10), pageSize = 1000, ...rest } = opts;
  const results: T[] = [];
  let page = 1;

  while (true) {
    const response = await cwmGet<T[]>(path, { page, pageSize, ...rest });
    const items = response.data;

    if (!Array.isArray(items) || items.length === 0) break;

    results.push(...items);
    logger.debug({ path, page, count: items.length }, 'Paginated page fetched');

    if (items.length < pageSize) break; // Last page

    page++;
    if (page > maxPages) {
      throw new Error(
        `paginateAll hit maxPages limit (${maxPages}) for ${path}. ` +
          `Use page/pageSize params to fetch a specific range, or increase CWM_MAX_PAGES.`
      );
    }
  }

  return results;
}

/**
 * Fetch the count of records matching a condition.
 * Uses the /{resource}/count endpoint.
 */
export async function fetchCount(path: string, conditions?: string): Promise<number> {
  const params: QueryParams = {};
  if (conditions) params['conditions'] = conditions;
  const response = await cwmGet<{ count: number }>(path, params);
  return response.data.count ?? 0;
}
