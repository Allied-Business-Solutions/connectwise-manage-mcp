import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cwmGet, cwmGetBinary } from '../client/cwmClient.js';
import { success } from '../schemas/common.js';
import { runTool } from '../utils/toolRunner.js';

export function registerSystemTools(server: McpServer): void {

  // ─── cw_ping ───────────────────────────────────────────────────────────────
  server.tool(
    'cw_ping',
    `Health check — hits /system/info to verify connectivity and authentication.
Calls GET /system/info.
Use this first to confirm the server is connected before running other tools.
Example: {}`,
    {},
    async () =>
      runTool('cw_ping', async () => {
        const response = await cwmGet<unknown>('/system/info');
        return success(response.data);
      })
  );

  // ─── cw_list_work_types ────────────────────────────────────────────────────
  server.tool(
    'cw_list_work_types',
    `List available work types for time entries.
Calls GET /time/workTypes.
Example: {}`,
    {
      conditions: z.string().optional(),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(100),
    },
    async ({ conditions, page, pageSize }) =>
      runTool('cw_list_work_types', async () => {
        const response = await cwmGet<unknown[]>('/time/workTypes', {
          conditions,
          page,
          pageSize,
          fields: 'id,name,inactiveFlag,billTime,hoursMax',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_list_work_roles ────────────────────────────────────────────────────
  server.tool(
    'cw_list_work_roles',
    `List available work roles for time entries.
Calls GET /time/workRoles.
Example: {}`,
    {
      conditions: z.string().optional(),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(100),
    },
    async ({ conditions, page, pageSize }) =>
      runTool('cw_list_work_roles', async () => {
        const response = await cwmGet<unknown[]>('/time/workRoles', {
          conditions,
          page,
          pageSize,
          fields: 'id,name,inactiveFlag,hourlyRate',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_list_priorities ────────────────────────────────────────────────────
  server.tool(
    'cw_list_priorities',
    `List ticket priorities.
Calls GET /service/priorities.
Example: {}`,
    {
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ page, pageSize }) =>
      runTool('cw_list_priorities', async () => {
        const response = await cwmGet<unknown[]>('/service/priorities', {
          page,
          pageSize,
          fields: 'id,name,color,defaultFlag',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_list_locations ─────────────────────────────────────────────────────
  server.tool(
    'cw_list_locations',
    `List system locations (offices/territories).
Calls GET /system/locations.
Example: {}`,
    {
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ page, pageSize }) =>
      runTool('cw_list_locations', async () => {
        const response = await cwmGet<unknown[]>('/system/locations', {
          page,
          pageSize,
          fields: 'id,name,where,salesRep,dispatch',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_list_departments ───────────────────────────────────────────────────
  server.tool(
    'cw_list_departments',
    `List system departments.
Calls GET /system/departments.
Example: {}`,
    {
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ page, pageSize }) =>
      runTool('cw_list_departments', async () => {
        const response = await cwmGet<unknown[]>('/system/departments', {
          page,
          pageSize,
          fields: 'id,name',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_download_document ──────────────────────────────────────────────────
  server.tool(
    'cw_download_document',
    `Download a document/attachment by ID and return its contents as base64.
Calls GET /system/documents/{id}/download.
Works for documents on any record type: tickets, projects, opportunities, companies, agreements, etc.
Use cw_list_ticket_documents, cw_list_project_documents, etc. to find document IDs first.
Returns: { fileName, contentType, sizeBytes, content (base64) }
Example: id=8821`,
    {
      id: z.number().int().positive().describe('Document ID from a cw_list_*_documents call'),
    },
    async ({ id }) =>
      runTool('cw_download_document', async () => {
        const response = await cwmGetBinary(`/system/documents/${id}/download`);
        const buffer = Buffer.from(response.data);

        // Extract filename from Content-Disposition header if present
        const disposition = response.headers['content-disposition'] as string | undefined;
        const fileNameMatch = disposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
        const fileName = fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1].replace(/"/g, '')) : `document-${id}`;

        const contentType = (response.headers['content-type'] as string | undefined) ?? 'application/octet-stream';

        return success({
          fileName,
          contentType,
          sizeBytes: buffer.length,
          content: buffer.toString('base64'),
        });
      })
  );
}
