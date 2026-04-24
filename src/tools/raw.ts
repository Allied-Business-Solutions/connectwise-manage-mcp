import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cwmGet, cwmPost, cwmPatch, cwmDelete } from '../client/cwmClient.js';
import { success } from '../schemas/common.js';
import { runTool } from '../utils/toolRunner.js';

/**
 * Raw escape-hatch tools. Only registered when CWM_ENABLE_RAW_TOOLS=true.
 * These allow power users to call any CWM endpoint directly.
 */
export function registerRawTools(server: McpServer): void {

  server.tool(
    'cw_raw_get',
    `[RAW] Make an authenticated GET request to any CWM API path.
Enabled via CWM_ENABLE_RAW_TOOLS=true.
Example: { path: "/service/tickets/count", queryParams: { conditions: "status/name=\\"Open\\"" } }`,
    {
      path: z.string().describe('API path starting with /, e.g. /service/tickets'),
      queryParams: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe('Query string parameters'),
    },
    async ({ path, queryParams }) =>
      runTool('cw_raw_get', async () => {
        const response = await cwmGet<unknown>(path, queryParams);
        return success(response.data, { path });
      })
  );

  server.tool(
    'cw_raw_post',
    `[RAW] Make an authenticated POST request to any CWM API path.
Enabled via CWM_ENABLE_RAW_TOOLS=true.
Example: { path: "/service/tickets", body: { summary: "Test", company: { id: 1 } } }`,
    {
      path: z.string().describe('API path starting with /'),
      body: z.record(z.unknown()).describe('Request body as JSON object'),
    },
    async ({ path, body }) =>
      runTool('cw_raw_post', async () => {
        const response = await cwmPost<unknown>(path, body);
        return success(response.data, { path });
      })
  );

  server.tool(
    'cw_raw_patch',
    `[RAW] Make an authenticated PATCH request with a JSON Patch array to any CWM API path.
Enabled via CWM_ENABLE_RAW_TOOLS=true.
Example: { path: "/service/tickets/123", jsonPatch: [{ op: "replace", path: "/summary", value: "New title" }] }`,
    {
      path: z.string().describe('API path starting with /'),
      jsonPatch: z.array(z.object({
        op: z.enum(['replace', 'add', 'remove']),
        path: z.string(),
        value: z.unknown().optional(),
      })).describe('RFC 6902 JSON Patch array'),
    },
    async ({ path, jsonPatch }) =>
      runTool('cw_raw_patch', async () => {
        const response = await cwmPatch<unknown>(path, jsonPatch);
        return success(response.data, { path });
      })
  );

  server.tool(
    'cw_raw_delete',
    `[RAW] Make an authenticated DELETE request to any CWM API path.
Enabled via CWM_ENABLE_RAW_TOOLS=true. Use with extreme caution — permanent operation.
Example: { path: "/time/entries/9876" }`,
    {
      path: z.string().describe('API path starting with /'),
    },
    async ({ path }) =>
      runTool('cw_raw_delete', async () => {
        await cwmDelete(path);
        return success({ deleted: true, path });
      })
  );
}
