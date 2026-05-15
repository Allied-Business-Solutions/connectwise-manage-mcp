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
import { registerExpenseTools } from './tools/expenses.js';
import { registerSystemTools } from './tools/system.js';
import { registerRawTools } from './tools/raw.js';

export function createServer(env: CwmEnv): McpServer {
  const server = new McpServer({
    name: 'connectwise-mcp',
    version: '1.0.0',
  });

  registerTicketTools(server);    // 24 tools
  registerProjectTools(server);   // 24 tools
  registerTimeTools(server);      // 11 tools
  registerCompanyTools(server);   // 8 tools
  registerContactTools(server);   // 7 tools
  registerAgreementTools(server); // 12 tools
  registerConfigurationTools(server); // 5 tools
  registerOpportunityTools(server);   // 10 tools
  registerExpenseTools(server);   // 10 tools
  registerSystemTools(server);    // 6 tools

  if (env.enableRawTools) {
    registerRawTools(server);     // 4 tools (gated)
  }

  return server;
}
