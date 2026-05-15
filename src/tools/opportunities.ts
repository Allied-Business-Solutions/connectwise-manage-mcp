import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cwmGet, cwmPost, cwmPatch, cwmDelete } from '../client/cwmClient.js';
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

  // ─── cw_add_opportunity_note ───────────────────────────────────────────────
  server.tool(
    'cw_add_opportunity_note',
    `Add a note to an opportunity.
Calls POST /sales/opportunities/{parentId}/notes.
Example: { opportunityId: 200, text: "Called prospect, demo scheduled for Friday" }`,
    {
      opportunityId: z.number().int().positive().describe('Opportunity ID'),
      text: z.string().min(1).describe('Note text'),
      type: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      flagged: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_add_opportunity_note', async () => {
        const { opportunityId, ...body } = params;
        const response = await cwmPost<unknown>(`/sales/opportunities/${opportunityId}/notes`, body);
        return success(response.data);
      })
  );

  // ─── cw_delete_opportunity ─────────────────────────────────────────────────
  server.tool(
    'cw_delete_opportunity',
    `Delete an opportunity permanently.
Calls DELETE /sales/opportunities/{id}.
Example: id=200`,
    {
      id: z.number().int().positive().describe('Opportunity ID'),
    },
    async ({ id }) =>
      runTool('cw_delete_opportunity', async () => {
        await cwmDelete(`/sales/opportunities/${id}`);
        return success({ deleted: true, id });
      })
  );

  // ─── cw_convert_opportunity_to_project ─────────────────────────────────────
  server.tool(
    'cw_convert_opportunity_to_project',
    `Convert an opportunity into a project. Returns the newly created project.
Calls POST /sales/opportunities/{id}/convertToProject.
Example: { id: 200, name: "Network Upgrade - Acme", board: { name: "Projects" }, estimatedStart: "2025-02-01", estimatedEnd: "2025-04-30" }`,
    {
      id: z.number().int().positive().describe('Opportunity ID'),
      name: z.string().optional().describe('Project name (defaults to opportunity name)'),
      board: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      manager: z.object({ id: z.number().optional(), identifier: z.string().optional() }).optional(),
      estimatedStart: z.string().optional().describe('ISO 8601 date'),
      estimatedEnd: z.string().optional().describe('ISO 8601 date'),
      includeAllNotesFlag: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_convert_opportunity_to_project', async () => {
        const { id, ...body } = params;
        const response = await cwmPost<unknown>(`/sales/opportunities/${id}/convertToProject`, body);
        return success(response.data);
      })
  );

  // ─── cw_convert_opportunity_to_ticket ──────────────────────────────────────
  server.tool(
    'cw_convert_opportunity_to_ticket',
    `Convert an opportunity into a service ticket. Returns the newly created ticket.
Calls POST /sales/opportunities/{id}/convertToServiceTicket.
Example: { id: 200, summary: "Install new switches - Acme", includeAllNotesFlag: true }`,
    {
      id: z.number().int().positive().describe('Opportunity ID'),
      summary: z.string().optional().describe('Ticket summary (defaults to opportunity name)'),
      includeAllNotesFlag: z.boolean().optional().default(false),
      includeAllDocumentsFlag: z.boolean().optional().default(false),
      includeAllProductsFlag: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_convert_opportunity_to_ticket', async () => {
        const { id, ...body } = params;
        const response = await cwmPost<unknown>(`/sales/opportunities/${id}/convertToServiceTicket`, body);
        return success(response.data);
      })
  );
}
