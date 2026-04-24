import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cwmGet, cwmPost, cwmPatch } from '../client/cwmClient.js';
import { flatToJsonPatch } from '../client/jsonPatch.js';
import { buildConditions, eq, contains } from '../client/conditions.js';
import { ListParamsSchema, success } from '../schemas/common.js';
import { runTool } from '../utils/toolRunner.js';

const CONFIG_LIST_FIELDS = 'id,name,type,status,company,contact,site,serialNumber,modelNumber,tagNumber,purchaseDate,installationDate,warrantyExpirationDate';

export function registerConfigurationTools(server: McpServer): void {

  // ─── cw_list_configurations ────────────────────────────────────────────────
  server.tool(
    'cw_list_configurations',
    `List configurations (managed assets/devices).
Calls GET /company/configurations.
Examples:
  - All configs for a company: conditions="company/id=42"
  - Active servers: conditions="type/name=\\"Server\\" AND status/name=\\"Active\\""`,
    {
      ...ListParamsSchema.shape,
      companyId: z.number().int().optional().describe('Filter by company ID'),
      typeName: z.string().optional().describe('Configuration type name'),
      statusName: z.string().optional().describe('Status name'),
      fullFields: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_list_configurations', async () => {
        const parts: string[] = [];
        if (params.companyId !== undefined) parts.push(eq('company/id', params.companyId));
        if (params.typeName) parts.push(eq('type/name', params.typeName));
        if (params.statusName) parts.push(eq('status/name', params.statusName));
        if (params.conditions) parts.push(params.conditions);

        const conditions = buildConditions(parts);
        const response = await cwmGet<unknown[]>('/company/configurations', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: conditions || undefined,
          orderBy: params.orderBy ?? 'name asc',
          fields: params.fields ?? (params.fullFields ? undefined : CONFIG_LIST_FIELDS),
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_configuration ──────────────────────────────────────────────────
  server.tool(
    'cw_get_configuration',
    `Get full details of a configuration/asset by ID.
Calls GET /company/configurations/{id}.
Example: id=500`,
    {
      id: z.number().int().positive().describe('Configuration ID'),
    },
    async ({ id }) =>
      runTool('cw_get_configuration', async () => {
        const response = await cwmGet<unknown>(`/company/configurations/${id}`);
        return success(response.data);
      })
  );

  // ─── cw_create_configuration ───────────────────────────────────────────────
  server.tool(
    'cw_create_configuration',
    `Create a configuration (asset/device) record. Required: name, type, company.
Calls POST /company/configurations.
Example: { name: "DELL-SERVER-01", type: { name: "Server" }, company: { id: 42 } }`,
    {
      name: z.string().min(1).describe('Configuration name'),
      type: z.object({ id: z.number().optional(), name: z.string().optional() }).describe('Configuration type'),
      company: z.object({ id: z.number() }).describe('Company reference'),
      status: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      contact: z.object({ id: z.number() }).optional(),
      site: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      serialNumber: z.string().optional(),
      modelNumber: z.string().optional(),
      tagNumber: z.string().optional(),
      purchaseDate: z.string().optional().describe('ISO 8601 date'),
      installationDate: z.string().optional().describe('ISO 8601 date'),
      warrantyExpirationDate: z.string().optional().describe('ISO 8601 date'),
      notes: z.string().optional(),
    },
    async (params) =>
      runTool('cw_create_configuration', async () => {
        const response = await cwmPost<unknown>('/company/configurations', params);
        return success(response.data);
      })
  );

  // ─── cw_update_configuration ───────────────────────────────────────────────
  server.tool(
    'cw_update_configuration',
    `Update a configuration using JSON Patch.
Calls PATCH /company/configurations/{id}.
Example: { id: 500, changes: { serialNumber: "ABC123", warrantyExpirationDate: "2027-01-01" } }`,
    {
      id: z.number().int().positive().describe('Configuration ID'),
      changes: z.record(z.unknown()).describe('Fields to update'),
    },
    async ({ id, changes }) =>
      runTool('cw_update_configuration', async () => {
        const patch = flatToJsonPatch(changes);
        const response = await cwmPatch<unknown>(`/company/configurations/${id}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_list_configuration_types ──────────────────────────────────────────
  server.tool(
    'cw_list_configuration_types',
    `List available configuration types (Server, Workstation, etc.).
Calls GET /company/configurations/types.
Example: {}`,
    {
      conditions: z.string().optional(),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(100),
    },
    async ({ conditions, page, pageSize }) =>
      runTool('cw_list_configuration_types', async () => {
        const response = await cwmGet<unknown[]>('/company/configurations/types', {
          conditions,
          page,
          pageSize,
          fields: 'id,name,inactiveFlag',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );
}
