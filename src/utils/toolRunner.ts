import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CwmApiError } from '../client/errors.js';
import { logger } from './logger.js';

/**
 * Wrap a tool handler: times it, logs it, and formats the MCP response.
 * All tools should use this wrapper.
 */
export async function runTool(
  toolName: string,
  fn: () => Promise<unknown>
): Promise<CallToolResult> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logger.info({ tool: toolName, durationMs: duration, ok: true }, 'Tool completed');
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const duration = Date.now() - start;
    if (err instanceof CwmApiError) {
      logger.error({ tool: toolName, durationMs: duration, code: err.code, status: err.httpStatus }, 'Tool failed');
      const errorResult = {
        ok: false,
        error: err.toJSON(),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(errorResult, null, 2) }],
        isError: true,
      };
    }
    // Non-CWM errors
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ tool: toolName, durationMs: duration, message }, 'Tool failed (unexpected)');
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: false, error: { code: 'InternalError', message, httpStatus: 0 } }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
