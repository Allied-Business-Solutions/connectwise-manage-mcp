import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cwmGet, cwmPost, cwmPatch, cwmDelete } from '../client/cwmClient.js';
import { flatToJsonPatch } from '../client/jsonPatch.js';
import { buildConditions, eq, contains, and } from '../client/conditions.js';
import { paginateAll, fetchCount } from '../client/paginate.js';
import { ListParamsSchema, success } from '../schemas/common.js';
import { runTool } from '../utils/toolRunner.js';
import { CwmApiError } from '../client/errors.js';

// Sparse field sets for list vs full detail
const TICKET_LIST_FIELDS = 'id,summary,status,board,company,contact,priority,owner,dateEntered,requiredDate,closedDate,type,subType,item,source,site,addressLine1';
const TICKET_FULL_FIELDS = undefined; // undefined = return all fields

export function registerTicketTools(server: McpServer): void {

  // ─── cw_list_tickets ───────────────────────────────────────────────────────
  server.tool(
    'cw_list_tickets',
    `List service tickets with optional filtering and pagination.
Calls GET /service/tickets.
Examples:
  - List open tickets on Help Desk board: conditions="status/name=\\"Open\\" AND board/name=\\"Help Desk MS\\""
  - List tickets for a company: conditions="company/name=\\"Acme Corp\\""`,
    {
      ...ListParamsSchema.shape,
      fullFields: z.boolean().optional().default(false).describe('Return all fields instead of the default sparse set'),
    },
    async (params) =>
      runTool('cw_list_tickets', async () => {
        const { page, pageSize, conditions, childconditions, customFieldConditions, orderBy, fields, fullFields } = params;
        const response = await cwmGet<unknown[]>('/service/tickets', {
          page,
          pageSize,
          conditions,
          childconditions,
          customFieldConditions,
          orderBy,
          fields: fields ?? (fullFields ? TICKET_FULL_FIELDS : TICKET_LIST_FIELDS),
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_search_tickets ─────────────────────────────────────────────────────
  server.tool(
    'cw_search_tickets',
    `Search tickets using common filters. Convenience wrapper around cw_list_tickets.
Calls GET /service/tickets with built conditions string.
Examples:
  - Search open tickets assigned to jsmith: assignedTo="jsmith", statusName="Open"
  - Find printer tickets: summaryLike="printer"`,
    {
      boardName: z.string().optional().describe('Filter by board name, e.g. "Help Desk MS"'),
      statusName: z.string().optional().describe('Filter by status name, e.g. "Open", "Completed~"'),
      assignedTo: z.string().optional().describe('Member identifier (username), e.g. "jsmith"'),
      companyName: z.string().optional().describe('Filter by company name'),
      summaryLike: z.string().optional().describe('Partial match on summary field'),
      dateFrom: z.string().optional().describe('ISO 8601 date lower bound on dateEntered'),
      dateTo: z.string().optional().describe('ISO 8601 date upper bound on dateEntered'),
      closedFlag: z.boolean().optional().describe('true=closed only, false=open only'),
      priority: z.string().optional().describe('Priority name, e.g. "Priority 1 - Critical"'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(25),
      orderBy: z.string().optional().default('dateEntered desc'),
      fullFields: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_search_tickets', async () => {
        const parts: string[] = [];
        if (params.boardName) parts.push(eq('board/name', params.boardName));
        if (params.statusName) parts.push(eq('status/name', params.statusName));
        if (params.assignedTo) parts.push(eq('resources', params.assignedTo));
        if (params.companyName) parts.push(eq('company/name', params.companyName));
        if (params.summaryLike) parts.push(contains('summary', params.summaryLike));
        if (params.dateFrom) parts.push(`dateEntered>[${params.dateFrom}T00:00:00Z]`);
        if (params.dateTo) parts.push(`dateEntered<[${params.dateTo}T23:59:59Z]`);
        if (params.closedFlag !== undefined) parts.push(eq('closedFlag', params.closedFlag));
        if (params.priority) parts.push(eq('priority/name', params.priority));

        const conditions = buildConditions(parts);
        const response = await cwmGet<unknown[]>('/service/tickets', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: conditions || undefined,
          orderBy: params.orderBy,
          fields: params.fullFields ? TICKET_FULL_FIELDS : TICKET_LIST_FIELDS,
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_ticket ─────────────────────────────────────────────────────────
  server.tool(
    'cw_get_ticket',
    `Get full details of a single service ticket by ID.
Calls GET /service/tickets/{id}.
Example: id=12345`,
    {
      id: z.number().int().positive().describe('Ticket ID'),
    },
    async ({ id }) =>
      runTool('cw_get_ticket', async () => {
        const response = await cwmGet<unknown>(`/service/tickets/${id}`);
        return success(response.data);
      })
  );

  // ─── cw_count_tickets ──────────────────────────────────────────────────────
  server.tool(
    'cw_count_tickets',
    `Count tickets matching a conditions filter.
Calls GET /service/tickets/count.
Example: conditions="status/name=\\"Open\\" AND board/name=\\"Help Desk MS\\""`,
    {
      conditions: z.string().optional().describe('CWM conditions string'),
    },
    async ({ conditions }) =>
      runTool('cw_count_tickets', async () => {
        const response = await cwmGet<{ count: number }>('/service/tickets/count', { conditions });
        return success({ count: response.data.count });
      })
  );

  // ─── cw_create_ticket ──────────────────────────────────────────────────────
  server.tool(
    'cw_create_ticket',
    `Create a new service ticket.
Calls POST /service/tickets.
Required: summary, company (id or name ref).
Example: { summary: "Printer offline", company: { id: 42 }, board: { name: "Help Desk MS" } }`,
    {
      summary: z.string().min(1).describe('Ticket summary / title'),
      company: z.object({ id: z.number() }).describe('Company reference { id: N }'),
      board: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      status: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      contact: z.object({ id: z.number() }).optional(),
      priority: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      type: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      subType: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      item: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      initialDescription: z.string().optional().describe('Initial ticket description / notes'),
      initialInternalAnalysis: z.string().optional(),
      owner: z.object({ id: z.number().optional(), identifier: z.string().optional() }).optional().describe('Assigned member'),
      site: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      severity: z.enum(['Low', 'Medium', 'High']).optional(),
      impact: z.enum(['Low', 'Medium', 'High']).optional(),
      requiredDate: z.string().optional().describe('ISO 8601 datetime'),
      budgetHours: z.number().optional(),
    },
    async (params) =>
      runTool('cw_create_ticket', async () => {
        const response = await cwmPost<unknown>('/service/tickets', params);
        return success(response.data);
      })
  );

  // ─── cw_update_ticket ──────────────────────────────────────────────────────
  server.tool(
    'cw_update_ticket',
    `Update a service ticket using JSON Patch (RFC 6902). Only send the fields you want to change.
Calls PATCH /service/tickets/{id}.
Examples:
  - Change summary: { id: 123, changes: { summary: "New title" } }
  - Move to different board: { id: 123, changes: { "board/id": 5 } }
  - Set required date: { id: 123, changes: { requiredDate: "2025-06-01T00:00:00Z" } }`,
    {
      id: z.number().int().positive().describe('Ticket ID'),
      changes: z.record(z.unknown()).describe('Fields to update. Use "/" for nested paths, e.g. "status/id": 42'),
    },
    async ({ id, changes }) =>
      runTool('cw_update_ticket', async () => {
        const patch = flatToJsonPatch(changes);
        const response = await cwmPatch<unknown>(`/service/tickets/${id}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_list_ticket_notes ──────────────────────────────────────────────────
  server.tool(
    'cw_list_ticket_notes',
    `List notes/discussions on a service ticket.
Calls GET /service/tickets/{parentId}/notes.
Example: ticketId=12345`,
    {
      ticketId: z.number().int().positive().describe('Ticket ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
      conditions: z.string().optional(),
    },
    async ({ ticketId, page, pageSize, conditions }) =>
      runTool('cw_list_ticket_notes', async () => {
        const response = await cwmGet<unknown[]>(`/service/tickets/${ticketId}/notes`, { page, pageSize, conditions });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_add_ticket_note ────────────────────────────────────────────────────
  server.tool(
    'cw_add_ticket_note',
    `Add a note to a service ticket.
Calls POST /service/tickets/{parentId}/notes.
At least one of detailDescriptionFlag, internalAnalysisFlag, or resolutionFlag should be true.
Example: { ticketId: 123, text: "Called customer, left voicemail", detailDescriptionFlag: true }`,
    {
      ticketId: z.number().int().positive().describe('Ticket ID'),
      text: z.string().min(1).describe('Note text'),
      detailDescriptionFlag: z.boolean().optional().default(false).describe('Add to detail description (customer-visible)'),
      internalAnalysisFlag: z.boolean().optional().default(false).describe('Add to internal analysis (tech-only)'),
      resolutionFlag: z.boolean().optional().default(false).describe('Add to resolution'),
      customerUpdatedFlag: z.boolean().optional().default(false).describe('Mark as customer-updated'),
      processNotifications: z.boolean().optional().describe('Send email notifications'),
    },
    async (params) =>
      runTool('cw_add_ticket_note', async () => {
        const { ticketId, ...body } = params;
        const response = await cwmPost<unknown>(`/service/tickets/${ticketId}/notes`, body);
        return success(response.data);
      })
  );

  // ─── cw_list_ticket_tasks ──────────────────────────────────────────────────
  server.tool(
    'cw_list_ticket_tasks',
    `List tasks/checklist items on a service ticket.
Calls GET /service/tickets/{parentId}/tasks.
Example: ticketId=12345`,
    {
      ticketId: z.number().int().positive().describe('Ticket ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ ticketId, page, pageSize }) =>
      runTool('cw_list_ticket_tasks', async () => {
        const response = await cwmGet<unknown[]>(`/service/tickets/${ticketId}/tasks`, { page, pageSize });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_add_ticket_task ────────────────────────────────────────────────────
  server.tool(
    'cw_add_ticket_task',
    `Add a task/checklist item to a service ticket.
Calls POST /service/tickets/{parentId}/tasks.
Example: { ticketId: 123, notes: "Restart print spooler", priority: 1 }`,
    {
      ticketId: z.number().int().positive().describe('Ticket ID'),
      notes: z.string().optional().describe('Task description'),
      priority: z.number().int().optional().describe('Task priority order'),
      schedule: z.string().optional().describe('Scheduled time for the task'),
      resolution: z.string().optional().describe('Resolution notes'),
      closedFlag: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_add_ticket_task', async () => {
        const { ticketId, ...body } = params;
        const response = await cwmPost<unknown>(`/service/tickets/${ticketId}/tasks`, body);
        return success(response.data);
      })
  );

  // ─── cw_update_ticket_task ─────────────────────────────────────────────────
  server.tool(
    'cw_update_ticket_task',
    `Update a task on a service ticket using JSON Patch.
Calls PATCH /service/tickets/{parentId}/tasks/{id}.
Example: { ticketId: 123, taskId: 5, changes: { closedFlag: true } }`,
    {
      ticketId: z.number().int().positive().describe('Ticket ID'),
      taskId: z.number().int().positive().describe('Task ID'),
      changes: z.record(z.unknown()).describe('Fields to update'),
    },
    async ({ ticketId, taskId, changes }) =>
      runTool('cw_update_ticket_task', async () => {
        const patch = flatToJsonPatch(changes);
        const response = await cwmPatch<unknown>(`/service/tickets/${ticketId}/tasks/${taskId}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_complete_ticket_task ───────────────────────────────────────────────
  server.tool(
    'cw_complete_ticket_task',
    `Mark a ticket task as completed.
Calls PATCH /service/tickets/{parentId}/tasks/{id} with closedFlag=true.
Example: { ticketId: 123, taskId: 5 }`,
    {
      ticketId: z.number().int().positive().describe('Ticket ID'),
      taskId: z.number().int().positive().describe('Task ID'),
    },
    async ({ ticketId, taskId }) =>
      runTool('cw_complete_ticket_task', async () => {
        const patch = flatToJsonPatch({ closedFlag: true });
        const response = await cwmPatch<unknown>(`/service/tickets/${ticketId}/tasks/${taskId}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_list_ticket_time_entries ───────────────────────────────────────────
  server.tool(
    'cw_list_ticket_time_entries',
    `List time entries logged against a service ticket.
Calls GET /service/tickets/{parentId}/timeentries.
Example: ticketId=12345`,
    {
      ticketId: z.number().int().positive().describe('Ticket ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ ticketId, page, pageSize }) =>
      runTool('cw_list_ticket_time_entries', async () => {
        const response = await cwmGet<unknown[]>(`/service/tickets/${ticketId}/timeentries`, { page, pageSize });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_list_ticket_configurations ────────────────────────────────────────
  server.tool(
    'cw_list_ticket_configurations',
    `List configurations (assets) attached to a service ticket.
Calls GET /service/tickets/{parentId}/configurations.
Example: ticketId=12345`,
    {
      ticketId: z.number().int().positive().describe('Ticket ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ ticketId, page, pageSize }) =>
      runTool('cw_list_ticket_configurations', async () => {
        const response = await cwmGet<unknown[]>(`/service/tickets/${ticketId}/configurations`, { page, pageSize });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_list_ticket_documents ──────────────────────────────────────────────
  server.tool(
    'cw_list_ticket_documents',
    `List documents/attachments on a service ticket.
Calls GET /service/tickets/{parentId}/documents.
Example: ticketId=12345`,
    {
      ticketId: z.number().int().positive().describe('Ticket ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ ticketId, page, pageSize }) =>
      runTool('cw_list_ticket_documents', async () => {
        const response = await cwmGet<unknown[]>(`/service/tickets/${ticketId}/documents`, { page, pageSize });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_change_ticket_status ───────────────────────────────────────────────
  server.tool(
    'cw_change_ticket_status',
    `Change the status of a service ticket by name. Looks up the status ID for the given board automatically.
Calls GET /service/boards/{boardId}/statuses then PATCH /service/tickets/{id}.
Allied-specific: use statusName="Completed~" for the Help Desk MS board completion status.
Example: { ticketId: 123, boardId: 1, statusName: "Completed~" }`,
    {
      ticketId: z.number().int().positive().describe('Ticket ID'),
      boardId: z.number().int().positive().describe('Board ID (use cw_list_boards to find)'),
      statusName: z.string().describe('Status name, e.g. "Open", "Completed~", "In Progress"'),
    },
    async ({ ticketId, boardId, statusName }) =>
      runTool('cw_change_ticket_status', async () => {
        // Look up status ID for this board
        const statusRes = await cwmGet<Array<{ id: number; name: string }>>(
          `/service/boards/${boardId}/statuses`,
          { conditions: `name="${statusName}"`, pageSize: 5 }
        );
        const status = statusRes.data.find((s) => s.name.toLowerCase() === statusName.toLowerCase());
        if (!status) {
          throw new CwmApiError(404, 'StatusNotFound', `Status "${statusName}" not found on board ${boardId}`);
        }
        const patch = flatToJsonPatch({ 'status/id': status.id });
        const response = await cwmPatch<unknown>(`/service/tickets/${ticketId}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_assign_ticket ──────────────────────────────────────────────────────
  server.tool(
    'cw_assign_ticket',
    `Assign a service ticket to a member (technician).
Calls PATCH /service/tickets/{id} with owner field.
Example: { ticketId: 123, memberIdentifier: "jsmith" }`,
    {
      ticketId: z.number().int().positive().describe('Ticket ID'),
      memberIdentifier: z.string().describe('Member username/identifier, e.g. "jsmith"'),
    },
    async ({ ticketId, memberIdentifier }) =>
      runTool('cw_assign_ticket', async () => {
        // Look up member by identifier
        const memberRes = await cwmGet<Array<{ id: number; identifier: string }>>(
          '/system/members',
          { conditions: `identifier="${memberIdentifier}"`, pageSize: 2, fields: 'id,identifier' }
        );
        const member = memberRes.data[0];
        if (!member) {
          throw new CwmApiError(404, 'MemberNotFound', `Member "${memberIdentifier}" not found`);
        }
        const patch = flatToJsonPatch({ 'owner/id': member.id });
        const response = await cwmPatch<unknown>(`/service/tickets/${ticketId}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_merge_tickets ──────────────────────────────────────────────────────
  server.tool(
    'cw_merge_tickets',
    `Merge a source ticket into a target ticket. The source ticket is closed and merged into the target.
Calls POST /service/tickets/{parentId}/merge.
Example: { ticketId: 123, mergeTicketId: 456 }`,
    {
      ticketId: z.number().int().positive().describe('Source ticket ID (will be merged/closed)'),
      mergeTicketId: z.number().int().positive().describe('Target ticket ID (receives the merge)'),
      mergeNotes: z.string().optional().describe('Optional notes about the merge'),
    },
    async ({ ticketId, mergeTicketId, mergeNotes }) =>
      runTool('cw_merge_tickets', async () => {
        const body: Record<string, unknown> = { mergeTicketId };
        if (mergeNotes) body['mergeNotes'] = mergeNotes;
        const response = await cwmPost<unknown>(`/service/tickets/${ticketId}/merge`, body);
        return success(response.data);
      })
  );

  // ─── cw_list_boards ────────────────────────────────────────────────────────
  server.tool(
    'cw_list_boards',
    `List all service boards.
Calls GET /service/boards.
Example: {} — returns all boards with id and name`,
    {
      conditions: z.string().optional(),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ conditions, page, pageSize }) =>
      runTool('cw_list_boards', async () => {
        const response = await cwmGet<unknown[]>('/service/boards', {
          conditions,
          page,
          pageSize,
          fields: 'id,name,location,department,inactiveFlag',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_list_board_statuses ────────────────────────────────────────────────
  server.tool(
    'cw_list_board_statuses',
    `List valid statuses for a service board. Use this to find status IDs before calling cw_change_ticket_status.
Calls GET /service/boards/{parentId}/statuses.
Example: { boardId: 1 }`,
    {
      boardId: z.number().int().positive().describe('Board ID'),
      conditions: z.string().optional(),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(100),
    },
    async ({ boardId, conditions, page, pageSize }) =>
      runTool('cw_list_board_statuses', async () => {
        const response = await cwmGet<unknown[]>(`/service/boards/${boardId}/statuses`, {
          conditions,
          page,
          pageSize,
          fields: 'id,name,defaultFlag,closedStatus,escalationStatus',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_list_board_types ───────────────────────────────────────────────────
  server.tool(
    'cw_list_board_types',
    `List ticket types for a service board.
Calls GET /service/boards/{parentId}/types.
Example: { boardId: 1 }`,
    {
      boardId: z.number().int().positive().describe('Board ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(100),
    },
    async ({ boardId, page, pageSize }) =>
      runTool('cw_list_board_types', async () => {
        const response = await cwmGet<unknown[]>(`/service/boards/${boardId}/types`, {
          page,
          pageSize,
          fields: 'id,name,inactiveFlag',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );
}
