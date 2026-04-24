import pino from 'pino';

const level = process.env['LOG_LEVEL'] ?? 'info';

export const logger = pino({
  level,
  // Always write to stderr — stdout is reserved for MCP JSON-RPC
  transport: {
    target: 'pino/file',
    options: { destination: 2 }, // fd 2 = stderr
  },
  base: { pid: process.pid },
});
