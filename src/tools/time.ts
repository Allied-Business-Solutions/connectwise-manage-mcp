import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cwmGet, cwmPost, cwmPatch, cwmDelete } from '../client/cwmClient.js';
import { flatToJsonPatch } from '../client/jsonPatch.js';
import { buildConditions, eq } from '../client/conditions.js';
import { ListParamsSchema, success } from '../schemas/common.js';
import { runTool } from '../utils/toolRunner.js';

const TIME_LIST_FIELDS = 'id,member,chargeToId,chargeToType,timeStart,timeEnd,actualHours,hoursBilled,workType,workRole,notes,billableOption,dateEntered';

export function registerTimeTools(server: McpServer): void {

  // ─── cw_list_time_entries ──────────────────────────────────────────────────
  server.tool(
    'cw_list_time_entries',
    `List time entries with optional filtering.
Calls GET /time/entries.
Examples:
  - Time for a ticket: conditions="chargeToId=123 AND chargeToType=\\"ServiceTicket\\""
  - Time for a member: conditions="member/identifier=\\"jsmith\\""
  - Date range: conditions="timeStart>[2025-01-01T00:00:00Z] AND timeStart<[2025-01-31T23:59:59Z]"`,
    {
      ...ListParamsSchema.shape,
      memberIdentifier: z.string().optional().describe('Filter by member username'),
      chargeToId: z.number().optional().describe('Ticket or project ID'),
      chargeToType: z.enum(['ServiceTicket', 'ProjectTicket', 'ChargeCode', 'Activity']).optional(),
      dateFrom: z.string().optional().describe('ISO 8601 date lower bound on timeStart'),
      dateTo: z.string().optional().describe('ISO 8601 date upper bound on timeStart'),
      fullFields: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_list_time_entries', async () => {
        const parts: string[] = [];
        if (params.memberIdentifier) parts.push(eq('member/identifier', params.memberIdentifier));
        if (params.chargeToId !== undefined) parts.push(eq('chargeToId', params.chargeToId));
        if (params.chargeToType) parts.push(eq('chargeToType', params.chargeToType));
        if (params.dateFrom) parts.push(`timeStart>[${params.dateFrom}T00:00:00Z]`);
        if (params.dateTo) parts.push(`timeStart<[${params.dateTo}T23:59:59Z]`);
        if (params.conditions) parts.push(params.conditions);

        const conditions = buildConditions(parts);
        const response = await cwmGet<unknown[]>('/time/entries', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: conditions || undefined,
          orderBy: params.orderBy ?? 'timeStart desc',
          fields: params.fields ?? (params.fullFields ? undefined : TIME_LIST_FIELDS),
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_time_entry ─────────────────────────────────────────────────────
  server.tool(
    'cw_get_time_entry',
    `Get a single time entry by ID.
Calls GET /time/entries/{id}.
Example: id=9876`,
    {
      id: z.number().int().positive().describe('Time entry ID'),
    },
    async ({ id }) =>
      runTool('cw_get_time_entry', async () => {
        const response = await cwmGet<unknown>(`/time/entries/${id}`);
        return success(response.data);
      })
  );

  // ─── cw_create_time_entry ──────────────────────────────────────────────────
  server.tool(
    'cw_create_time_entry',
    `Log a time entry against a ticket, project ticket, or charge code.
Calls POST /time/entries.
Required: timeStart. Typical: chargeToId + chargeToType, member, timeStart + timeEnd.
Example: { chargeToId: 123, chargeToType: "ServiceTicket", member: { identifier: "jsmith" }, timeStart: "2025-01-15T09:00:00Z", timeEnd: "2025-01-15T10:30:00Z", notes: "Troubleshot printer" }`,
    {
      timeStart: z.string().describe('ISO 8601 datetime when work started'),
      timeEnd: z.string().optional().describe('ISO 8601 datetime when work ended'),
      chargeToId: z.number().int().optional().describe('Ticket/project ID to charge time to'),
      chargeToType: z.enum(['ServiceTicket', 'ProjectTicket', 'ChargeCode', 'Activity']).optional(),
      member: z.object({ id: z.number().optional(), identifier: z.string().optional() }).optional(),
      workType: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      workRole: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      notes: z.string().optional().describe('Time entry notes / work performed'),
      internalNotes: z.string().optional(),
      hoursBilled: z.number().optional().describe('Override billable hours (defaults to actual duration)'),
      billableOption: z.enum(['Billable', 'DoNotBill', 'NoCharge', 'NoDefault']).optional(),
      addToDetailDescriptionFlag: z.boolean().optional(),
      addToInternalAnalysisFlag: z.boolean().optional(),
      addToResolutionFlag: z.boolean().optional(),
    },
    async (params) =>
      runTool('cw_create_time_entry', async () => {
        const response = await cwmPost<unknown>('/time/entries', params);
        return success(response.data);
      })
  );

  // ─── cw_update_time_entry ──────────────────────────────────────────────────
  server.tool(
    'cw_update_time_entry',
    `Update a time entry using JSON Patch.
Calls PATCH /time/entries/{id}.
Example: { id: 9876, changes: { notes: "Updated notes", hoursBilled: 2.5 } }`,
    {
      id: z.number().int().positive().describe('Time entry ID'),
      changes: z.record(z.unknown()).describe('Fields to update'),
    },
    async ({ id, changes }) =>
      runTool('cw_update_time_entry', async () => {
        const patch = flatToJsonPatch(changes);
        const response = await cwmPatch<unknown>(`/time/entries/${id}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_delete_time_entry ──────────────────────────────────────────────────
  server.tool(
    'cw_delete_time_entry',
    `Delete a time entry. Use with caution — this is permanent.
Calls DELETE /time/entries/{id}.
Example: id=9876`,
    {
      id: z.number().int().positive().describe('Time entry ID'),
    },
    async ({ id }) =>
      runTool('cw_delete_time_entry', async () => {
        await cwmDelete(`/time/entries/${id}`);
        return success({ deleted: true, id });
      })
  );

  // ─── cw_list_schedule_entries ──────────────────────────────────────────────
  server.tool(
    'cw_list_schedule_entries',
    `List schedule entries (calendar events / dispatch assignments).
Calls GET /schedule/entries.
Examples:
  - Member's schedule: conditions="member/identifier=\\"jsmith\\""
  - Ticket appointments: conditions="objectId=123 AND type/name=\\"Service\\""`,
    {
      ...ListParamsSchema.shape,
      memberIdentifier: z.string().optional().describe('Filter by member username'),
      objectId: z.number().optional().describe('Linked record ID (ticket, activity, etc.)'),
      dateFrom: z.string().optional().describe('ISO 8601 date lower bound on dateStart'),
      dateTo: z.string().optional().describe('ISO 8601 date upper bound on dateEnd'),
    },
    async (params) =>
      runTool('cw_list_schedule_entries', async () => {
        const parts: string[] = [];
        if (params.memberIdentifier) parts.push(eq('member/identifier', params.memberIdentifier));
        if (params.objectId !== undefined) parts.push(eq('objectId', params.objectId));
        if (params.dateFrom) parts.push(`dateStart>[${params.dateFrom}T00:00:00Z]`);
        if (params.dateTo) parts.push(`dateEnd<[${params.dateTo}T23:59:59Z]`);
        if (params.conditions) parts.push(params.conditions);

        const conditions = buildConditions(parts);
        const response = await cwmGet<unknown[]>('/schedule/entries', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: conditions || undefined,
          orderBy: params.orderBy ?? 'dateStart asc',
          fields: params.fields ?? 'id,objectId,name,member,dateStart,dateEnd,type,status,doneFlag,hours',
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_create_schedule_entry ──────────────────────────────────────────────
  server.tool(
    'cw_create_schedule_entry',
    `Create a schedule entry (appointment / dispatch assignment). Required: type.
Calls POST /schedule/entries.
Example: { objectId: 123, member: { identifier: "jsmith" }, type: { name: "Service" }, dateStart: "2025-01-15T09:00:00Z", dateEnd: "2025-01-15T11:00:00Z" }`,
    {
      type: z.object({ id: z.number().optional(), name: z.string().optional() }).describe('Schedule type, e.g. { name: "Service" }'),
      objectId: z.number().int().optional().describe('ID of the linked record (ticket, activity, etc.)'),
      member: z.object({ id: z.number().optional(), identifier: z.string().optional() }).optional(),
      dateStart: z.string().optional().describe('ISO 8601 datetime'),
      dateEnd: z.string().optional().describe('ISO 8601 datetime'),
      hours: z.number().optional(),
      where: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      reminder: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
    },
    async (params) =>
      runTool('cw_create_schedule_entry', async () => {
        const response = await cwmPost<unknown>('/schedule/entries', params);
        return success(response.data);
      })
  );

  // ─── cw_list_members ───────────────────────────────────────────────────────
  server.tool(
    'cw_list_members',
    `List CWM members (technicians/staff). By default returns only active members.
Calls GET /system/members.
Example: {} — returns active members with id, identifier, firstName, lastName`,
    {
      conditions: z.string().optional().describe('CWM conditions, e.g. licenseClass="F" for full members'),
      includeInactive: z.boolean().optional().default(false).describe('Include inactive members'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(100),
    },
    async ({ conditions, includeInactive, page, pageSize }) =>
      runTool('cw_list_members', async () => {
        const parts: string[] = [];
        if (!includeInactive) parts.push(eq('inactiveFlag', false));
        if (conditions) parts.push(conditions);
        const fullConditions = buildConditions(parts);

        const response = await cwmGet<unknown[]>('/system/members', {
          page,
          pageSize,
          conditions: fullConditions || undefined,
          fields: 'id,identifier,firstName,lastName,title,licenseClass,inactiveFlag,defaultEmail',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_member ─────────────────────────────────────────────────────────
  server.tool(
    'cw_get_member',
    `Get details of a single member by ID.
Calls GET /system/members/{id}.
Example: id=10`,
    {
      id: z.number().int().positive().describe('Member ID'),
    },
    async ({ id }) =>
      runTool('cw_get_member', async () => {
        const response = await cwmGet<unknown>(`/system/members/${id}`);
        return success(response.data);
      })
  );
}
