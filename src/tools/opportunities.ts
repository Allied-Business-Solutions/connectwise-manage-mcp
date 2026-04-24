import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cwmGet, cwmPatch } from '../client/cwmClient.js';
import { flatToJsonPatch } from '../client/jsonPatch.js';
import { buildConditions, eq, contains } from '../client/conditions.js';
import { ListParamsSchema, success } from '../schemas/common.js';
import { runTool } from '../utils/toolRunner.js';

const OPP_LIST_FIELDS = 'id,name,company,contact,status,type,probability,expectedCloseDate,pipeline,forecastValue,assignedTo,dateEntered';

export function registerOpportunityTools(server: McpServer): void {

  // ─── cw_list_opportunities ─────────────────────────────────────────────────
  server.tool(
    'cw_list_opportunities',
    `List sales opportunities with optional filtering.
Calls GET /sales/opportunities.
Examples:
  - Open opportunities: conditions="status/name=\\"Open\\""
  - Opportunities for a company: conditions="company/id=42"`,
    {
      ...ListParamsSchema.shape,
      companyId: z.number().int().optional().describe('Filter by company ID'),
      statusName: z.string().optional().describe('Status name, e.g. "Open", "Won", "Lost"'),
      assignedToIdentifier: z.string().optional().describe('Assigned member identifier'),
      fullFields: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_list_opportunities', async () => {
        const parts: string[] = [];
        if (params.companyId !== undefined) parts.push(eq('company/id', params.companyId));
        if (params.statusName) parts.push(eq('status/name', params.statusName));
        if (params.assignedToIdentifier) parts.push(eq('assignedTo/identifier', params.assignedToIdentifier));
        if (params.conditions) parts.push(params.conditions);

        const conditions = buildConditions(parts);
        const response = await cwmGet<unknown[]>('/sales/opportunities', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: conditions || undefined,
          orderBy: params.orderBy ?? 'expectedCloseDate asc',
          fields: params.fields ?? (params.fullFields ? undefined : OPP_LIST_FIELDS),
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_opportunity ────────────────────────────────────────────────────
  server.tool(
    'cw_get_opportunity',
    `Get full details of an opportunity by ID.
Calls GET /sales/opportunities/{id}.
Example: id=200`,
    {
      id: z.number().int().positive().describe('Opportunity ID'),
    },
    async ({ id }) =>
      runTool('cw_get_opportunity', async () => {
        const response = await cwmGet<unknown>(`/sales/opportunities/${id}`);
        return success(response.data);
      })
  );

  // ─── cw_list_opportunity_notes ─────────────────────────────────────────────
  server.tool(
    'cw_list_opportunity_notes',
    `List notes on an opportunity.
Calls GET /sales/opportunities/{parentId}/notes.
Example: opportunityId=200`,
    {
      opportunityId: z.number().int().positive().describe('Opportunity ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ opportunityId, page, pageSize }) =>
      runTool('cw_list_opportunity_notes', async () => {
        const response = await cwmGet<unknown[]>(`/sales/opportunities/${opportunityId}/notes`, { page, pageSize });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_update_opportunity ─────────────────────────────────────────────────
  server.tool(
    'cw_update_opportunity',
    `Update an opportunity using JSON Patch.
Calls PATCH /sales/opportunities/{id}.
Example: { id: 200, changes: { "status/name": "Won", forecastValue: 25000 } }`,
    {
      id: z.number().int().positive().describe('Opportunity ID'),
      changes: z.record(z.unknown()).describe('Fields to update'),
    },
    async ({ id, changes }) =>
      runTool('cw_update_opportunity', async () => {
        const patch = flatToJsonPatch(changes);
        const response = await cwmPatch<unknown>(`/sales/opportunities/${id}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_list_opportunity_documents ─────────────────────────────────────────
  server.tool(
    'cw_list_opportunity_documents',
    `List documents/attachments on an opportunity.
Calls GET /system/documents?recordType=Opportunity&recordId={id}.
Example: id=200`,
    {
      id: z.number().int().positive().describe('Opportunity ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ id, page, pageSize }) =>
      runTool('cw_list_opportunity_documents', async () => {
        const response = await cwmGet<unknown[]>('/system/documents', { recordType: 'Opportunity', recordId: id, page, pageSize });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_list_quote_documents ────────────────────────────────────────────────
  server.tool(
    'cw_list_quote_documents',
    `List documents/attachments on a sales quote (SalesOrder).
Calls GET /system/documents?recordType=SalesOrder&recordId={id}.
Example: id=55`,
    {
      id: z.number().int().positive().describe('Sales Order / Quote ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ id, page, pageSize }) =>
      runTool('cw_list_quote_documents', async () => {
        const response = await cwmGet<unknown[]>('/system/documents', { recordType: 'SalesOrder', recordId: id, page, pageSize });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );
}
