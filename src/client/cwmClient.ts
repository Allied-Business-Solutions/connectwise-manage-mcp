import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, isAxiosError } from 'axios';
import { CwmEnv } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { CwmApiError, parseCwmError } from './errors.js';

const ACCEPT_HEADER = 'application/vnd.connectwise.com+json; version=2020.1';
const MAX_RETRIES = 3;

export type QueryParams = Record<string, string | number | boolean | undefined>;

export function buildAuthHeader(companyId: string, publicKey: string, privateKey: string): string {
  const credentials = `${companyId}+${publicKey}:${privateKey}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

export function createCwmClient(env: CwmEnv): AxiosInstance {
  const baseURL = `https://${env.site}/v4_6_release/apis/3.0`;
  const authHeader = buildAuthHeader(env.companyId, env.publicKey, env.privateKey);

  const client = axios.create({
    baseURL,
    headers: {
      Authorization: authHeader,
      clientId: env.clientId,
      Accept: ACCEPT_HEADER,
      'Content-Type': 'application/json',
    },
    timeout: 30_000,
  });

  // Request interceptor — debug logging (never log full auth header value)
  client.interceptors.request.use((config) => {
    logger.debug({ method: config.method?.toUpperCase(), url: config.url, params: config.params }, 'CWM request');
    return config;
  });

  // Response interceptor — error normalization + retry on 429
  client.interceptors.response.use(
    (response) => {
      logger.debug({ status: response.status, url: response.config.url }, 'CWM response');
      return response;
    },
    async (error) => {
      if (!isAxiosError(error) || !error.config) {
        throw error;
      }

      const status = error.response?.status;
      const config = error.config as AxiosRequestConfig & { _retryCount?: number };

      // Retry on 429 with Retry-After backoff
      if (status === 429) {
        const retryCount = config._retryCount ?? 0;
        if (retryCount < MAX_RETRIES) {
          const retryAfter = parseInt(error.response?.headers?.['retry-after'] ?? '2', 10);
          const delay = retryAfter * 1000 * Math.pow(2, retryCount);
          logger.warn({ retryCount, delay, url: config.url }, 'Rate limited — retrying');
          config._retryCount = retryCount + 1;
          await sleep(delay);
          return client.request(config);
        }
      }

      // Normalize error
      const cwmError = parseCwmError(status ?? 0, error.response?.data);
      logger.error(
        { httpStatus: cwmError.httpStatus, code: cwmError.code, message: cwmError.message, url: config.url },
        'CWM API error'
      );
      throw cwmError;
    }
  );

  return client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Singleton instance — initialized in server.ts
let _client: AxiosInstance | null = null;

export function initClient(env: CwmEnv): void {
  _client = createCwmClient(env);
}

export function getClient(): AxiosInstance {
  if (!_client) throw new Error('CWM client not initialized — call initClient() first');
  return _client;
}

// Convenience typed wrappers
export async function cwmGet<T>(path: string, params?: QueryParams): Promise<AxiosResponse<T>> {
  return getClient().get<T>(path, { params });
}

export async function cwmPost<T>(path: string, data: unknown): Promise<AxiosResponse<T>> {
  return getClient().post<T>(path, data);
}

export async function cwmPatch<T>(path: string, data: unknown): Promise<AxiosResponse<T>> {
  return getClient().patch<T>(path, data);
}

export async function cwmPut<T>(path: string, data: unknown): Promise<AxiosResponse<T>> {
  return getClient().put<T>(path, data);
}

export async function cwmDelete(path: string): Promise<AxiosResponse<void>> {
  return getClient().delete(path);
}

export { CwmApiError };
