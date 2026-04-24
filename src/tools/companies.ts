import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cwmGet, cwmPost, cwmPatch } from '../client/cwmClient.js';
import { flatToJsonPatch } from '../client/jsonPatch.js';
import { buildConditions, eq, contains } from '../client/conditions.js';
import { ListParamsSchema, success } from '../schemas/common.js';
import { runTool } from '../utils/toolRunner.js';

const COMPANY_LIST_FIELDS = 'id,identifier,name,status,type,territory,site,phoneNumber,website,dateAcquired';

export function registerCompanyTools(server: McpServer): void {

  // ─── cw_list_companies ─────────────────────────────────────────────────────
  server.tool(
    'cw_list_companies',
    `List companies with optional filtering.
Calls GET /company/companies.
Examples:
  - Active companies: conditions="status/name=\\"Active\\""
  - By type: conditions="type/name=\\"Customer\\""`,
    {
      ...ListParamsSchema.shape,
      fullFields: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_list_companies', async () => {
        const response = await cwmGet<unknown[]>('/company/companies', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: params.conditions,
          orderBy: params.orderBy,
          fields: params.fields ?? (params.fullFields ? undefined : COMPANY_LIST_FIELDS),
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_company ────────────────────────────────────────────────────────
  server.tool(
    'cw_get_company',
    `Get full details of a company by ID.
Calls GET /company/companies/{id}.
Example: id=42`,
    {
      id: z.number().int().positive().describe('Company ID'),
    },
    async ({ id }) =>
      runTool('cw_get_company', async () => {
        const response = await cwmGet<unknown>(`/company/companies/${id}`);
        return success(response.data);
      })
  );

  // ─── cw_search_companies ───────────────────────────────────────────────────
  server.tool(
    'cw_search_companies',
    `Search companies by name, identifier, city, or status.
Calls GET /company/companies with built conditions.
Example: { nameLike: "Allied", status: "Active" }`,
    {
      nameLike: z.string().optional().describe('Partial company name match'),
      identifier: z.string().optional().describe('Company short ID/identifier (exact match)'),
      city: z.string().optional().describe('City name'),
      statusName: z.string().optional().describe('Status name, e.g. "Active", "Inactive"'),
      typeName: z.string().optional().describe('Company type name'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(25),
      orderBy: z.string().optional().default('name asc'),
    },
    async (params) =>
      runTool('cw_search_companies', async () => {
        const parts: string[] = [];
        if (params.nameLike) parts.push(contains('name', params.nameLike));
        if (params.identifier) parts.push(eq('identifier', params.identifier));
        if (params.city) parts.push(eq('site/city', params.city));
        if (params.statusName) parts.push(eq('status/name', params.statusName));
        if (params.typeName) parts.push(eq('type/name', params.typeName));

        const conditions = buildConditions(parts);
        const response = await cwmGet<unknown[]>('/company/companies', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: conditions || undefined,
          orderBy: params.orderBy,
          fields: COMPANY_LIST_FIELDS,
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_update_company ─────────────────────────────────────────────────────
  server.tool(
    'cw_update_company',
    `Update a company using JSON Patch.
Calls PATCH /company/companies/{id}.
Example: { id: 42, changes: { phoneNumber: "555-1234" } }`,
    {
      id: z.number().int().positive().describe('Company ID'),
      changes: z.record(z.unknown()).describe('Fields to update'),
    },
    async ({ id, changes }) =>
      runTool('cw_update_company', async () => {
        const patch = flatToJsonPatch(changes);
        const response = await cwmPatch<unknown>(`/company/companies/${id}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_list_company_sites ─────────────────────────────────────────────────
  server.tool(
    'cw_list_company_sites',
    `List sites/locations for a company.
Calls GET /company/companies/{parentId}/sites.
Example: companyId=42`,
    {
      companyId: z.number().int().positive().describe('Company ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ companyId, page, pageSize }) =>
      runTool('cw_list_company_sites', async () => {
        const response = await cwmGet<unknown[]>(`/company/companies/${companyId}/sites`, {
          page,
          pageSize,
          fields: 'id,name,addressLine1,addressLine2,city,state,zip,phoneNumber,defaultFlag',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_list_company_notes ─────────────────────────────────────────────────
  server.tool(
    'cw_list_company_notes',
    `List notes on a company.
Calls GET /company/companies/{parentId}/notes.
Example: companyId=42`,
    {
      companyId: z.number().int().positive().describe('Company ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ companyId, page, pageSize }) =>
      runTool('cw_list_company_notes', async () => {
        const response = await cwmGet<unknown[]>(`/company/companies/${companyId}/notes`, { page, pageSize });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_add_company_note ───────────────────────────────────────────────────
  server.tool(
    'cw_add_company_note',
    `Add a note to a company.
Calls POST /company/companies/{parentId}/notes.
Example: { companyId: 42, text: "Customer requested quarterly review" }`,
    {
      companyId: z.number().int().positive().describe('Company ID'),
      text: z.string().min(1).describe('Note text'),
      type: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      flagged: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_add_company_note', async () => {
        const { companyId, ...body } = params;
        const response = await cwmPost<unknown>(`/company/companies/${companyId}/notes`, body);
        return success(response.data);
      })
  );
}
