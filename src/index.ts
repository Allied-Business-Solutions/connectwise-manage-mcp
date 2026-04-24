#!/usr/bin/env node
/**
 * ConnectWise Manage MCP Server
 * stdio transport entry point for Claude Desktop
 */
// Load .env silently if present — Claude Desktop passes env via config block,
// but .env is useful for local dev. process.loadEnvFile() is silent (no stdout).
try { process.loadEnvFile(); } catch { /* no .env file, that's fine */ }
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadEnv } from './utils/env.js';
import { initClient } from './client/cwmClient.js';
import { createServer } from './server.js';
import { logger } from './utils/logger.js';

async function main() {
  // Load and validate all required env vars — hard fail if missing
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    process.stderr.write(`\nFATAL: ${err instanceof Error ? err.message : String(err)}\n\n`);
    process.exit(1);
  }

  // Initialize HTTP client with auth
  initClient(env);
  logger.info({ site: env.site, companyId: env.companyId, rawTools: env.enableRawTools }, 'ConnectWise MCP server starting');

  // Create and connect MCP server
  const server = createServer(env);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('ConnectWise MCP server connected and ready');
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
