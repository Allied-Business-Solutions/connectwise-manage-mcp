import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CwmEnv } from './utils/env.js';
import { registerTicketTools } from './tools/tickets.js';
import { registerProjectTools } from './tools/projects.js';
import { registerTimeTools } from './tools/time.js';
import { registerCompanyTools } from './tools/companies.js';
import { registerContactTools } from './tools/contacts.js';
import { registerAgreementTools } from './tools/agreements.js';
import { registerConfigurationTools } from './tools/configurations.js';
import { registerOpportunityTools } from './tools/opportunities.js';
import { registerSystemTools } from './tools/system.js';
import { registerRawTools } from './tools/raw.js';

export function createServer(env: CwmEnv): McpServer {
  const server = new McpServer({
    name: 'connectwise-mcp',
    version: '1.0.0',
  });

  registerTicketTools(server);    // 20 tools
  registerProjectTools(server);   // 15 tools
  registerTimeTools(server);      // 8 tools
  registerCompanyTools(server);   // 6 tools
  registerContactTools(server);   // 5 tools
  registerAgreementTools(server); // 6 tools
  registerConfigurationTools(server); // 5 tools
  registerOpportunityTools(server);   // 4 tools
  registerSystemTools(server);    // 6 tools

  if (env.enableRawTools) {
    registerRawTools(server);     // 4 tools (gated)
  }

  return server;
}
