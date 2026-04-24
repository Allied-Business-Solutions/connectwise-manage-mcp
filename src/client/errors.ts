export interface CwmErrorDetail {
  code: string;
  message: string;
  resource?: string | undefined;
}

export class CwmApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    message: string,
    public readonly errors: CwmErrorDetail[] = []
  ) {
    super(message);
    this.name = 'CwmApiError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      details: this.errors,
    };
  }
}

/**
 * Parse an axios error response into a CwmApiError.
 * CWM error shape: { code, message, errors: [{ code, message, resource }] }
 */
export function parseCwmError(status: number, data: unknown): CwmApiError {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const code = typeof d['code'] === 'string' ? d['code'] : 'UnknownError';
    const message = typeof d['message'] === 'string' ? d['message'] : `HTTP ${status}`;
    const errors: CwmErrorDetail[] = Array.isArray(d['errors'])
      ? (d['errors'] as unknown[]).map((e) => {
          if (e && typeof e === 'object' && !Array.isArray(e)) {
            const err = e as Record<string, unknown>;
            return {
              code: typeof err['code'] === 'string' ? err['code'] : '',
              message: typeof err['message'] === 'string' ? err['message'] : '',
              resource: typeof err['resource'] === 'string' ? err['resource'] : undefined,
            };
          }
          return { code: '', message: String(e) };
        })
      : [];
    return new CwmApiError(status, code, message, errors);
  }
  return new CwmApiError(status, 'UnknownError', `HTTP ${status}: ${JSON.stringify(data)}`);
}
