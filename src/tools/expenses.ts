import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cwmGet, cwmPost, cwmPatch, cwmDelete } from '../client/cwmClient.js';
import { flatToJsonPatch } from '../client/jsonPatch.js';
import { buildConditions, eq } from '../client/conditions.js';
import { ListParamsSchema, success } from '../schemas/common.js';
import { runTool } from '../utils/toolRunner.js';

const EXPENSE_ENTRY_LIST_FIELDS = 'id,expenseReport,company,chargeToId,chargeToType,type,member,amount,date,billableOption,notes,status';
const EXPENSE_REPORT_LIST_FIELDS = 'id,member,title,total,status,dateSubmitted';

export function registerExpenseTools(server: McpServer): void {

  // ─── cw_list_expense_entries ───────────────────────────────────────────────
  server.tool(
    'cw_list_expense_entries',
    `List expense entries with optional filtering.
Calls GET /expense/entries.
Examples:
  - Entries for a member: conditions="member/identifier=\\"jsmith\\""
  - Entries for a ticket: conditions="chargeToId=123 AND chargeToType=\\"ServiceTicket\\""
  - Date range: conditions="date>[2025-01-01] AND date<[2025-01-31]"`,
    {
      ...ListParamsSchema.shape,
      memberIdentifier: z.string().optional().describe('Filter by member username'),
      chargeToId: z.number().optional().describe('Ticket or project ID'),
      chargeToType: z.enum(['ServiceTicket', 'ProjectTicket', 'ChargeCode', 'Activity']).optional(),
      fullFields: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_list_expense_entries', async () => {
        const parts: string[] = [];
        if (params.memberIdentifier) parts.push(eq('member/identifier', params.memberIdentifier));
        if (params.chargeToId !== undefined) parts.push(eq('chargeToId', params.chargeToId));
        if (params.chargeToType) parts.push(eq('chargeToType', params.chargeToType));
        if (params.conditions) parts.push(params.conditions);

        const conditions = buildConditions(parts);
        const response = await cwmGet<unknown[]>('/expense/entries', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: conditions || undefined,
          orderBy: params.orderBy ?? 'date desc',
          fields: params.fields ?? (params.fullFields ? undefined : EXPENSE_ENTRY_LIST_FIELDS),
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_expense_entry ──────────────────────────────────────────────────
  server.tool(
    'cw_get_expense_entry',
    `Get full details of a single expense entry by ID.
Calls GET /expense/entries/{id}.
Example: id=300`,
    {
      id: z.number().int().positive().describe('Expense entry ID'),
    },
    async ({ id }) =>
      runTool('cw_get_expense_entry', async () => {
        const response = await cwmGet<unknown>(`/expense/entries/${id}`);
        return success(response.data);
      })
  );

  // ─── cw_create_expense_entry ───────────────────────────────────────────────
  server.tool(
    'cw_create_expense_entry',
    `Create an expense entry. Required: type, amount, date.
Calls POST /expense/entries.
Example: { type: { name: "Mileage" }, amount: 45.50, date: "2025-01-15", chargeToId: 123, chargeToType: "ServiceTicket", member: { identifier: "jsmith" }, notes: "Drive to customer site" }`,
    {
      type: z.object({ id: z.number().optional(), name: z.string().optional() }).describe('Expense type reference'),
      amount: z.number().describe('Expense amount'),
      date: z.string().describe('ISO 8601 date, e.g. 2025-01-15'),
      chargeToId: z.number().int().optional().describe('Ticket or project ID to charge against'),
      chargeToType: z.enum(['ServiceTicket', 'ProjectTicket', 'ChargeCode', 'Activity']).optional(),
      member: z.object({ id: z.number().optional(), identifier: z.string().optional() }).optional(),
      paymentMethod: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      billableOption: z.enum(['Billable', 'DoNotBill', 'NoCharge', 'NoDefault']).optional(),
      notes: z.string().optional(),
      company: z.object({ id: z.number() }).optional(),
      agreement: z.object({ id: z.number() }).optional(),
    },
    async (params) =>
      runTool('cw_create_expense_entry', async () => {
        const response = await cwmPost<unknown>('/expense/entries', params);
        return success(response.data);
      })
  );

  // ─── cw_update_expense_entry ───────────────────────────────────────────────
  server.tool(
    'cw_update_expense_entry',
    `Update an expense entry using JSON Patch.
Calls PATCH /expense/entries/{id}.
Example: { id: 300, changes: { amount: 52.00, notes: "Drive to customer site and return" } }`,
    {
      id: z.number().int().positive().describe('Expense entry ID'),
      changes: z.record(z.unknown()).describe('Fields to update'),
    },
    async ({ id, changes }) =>
      runTool('cw_update_expense_entry', async () => {
        const patch = flatToJsonPatch(changes);
        const response = await cwmPatch<unknown>(`/expense/entries/${id}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_delete_expense_entry ───────────────────────────────────────────────
  server.tool(
    'cw_delete_expense_entry',
    `Delete an expense entry permanently.
Calls DELETE /expense/entries/{id}.
Example: id=300`,
    {
      id: z.number().int().positive().describe('Expense entry ID'),
    },
    async ({ id }) =>
      runTool('cw_delete_expense_entry', async () => {
        await cwmDelete(`/expense/entries/${id}`);
        return success({ deleted: true, id });
      })
  );

  // ─── cw_list_expense_reports ───────────────────────────────────────────────
  server.tool(
    'cw_list_expense_reports',
    `List expense reports with optional filtering.
Calls GET /expense/reports.
Examples:
  - Pending approval: conditions="status=\\"Submitted\\""
  - For a member: conditions="member/identifier=\\"jsmith\\""`,
    {
      ...ListParamsSchema.shape,
      memberIdentifier: z.string().optional().describe('Filter by member username'),
      fullFields: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_list_expense_reports', async () => {
        const parts: string[] = [];
        if (params.memberIdentifier) parts.push(eq('member/identifier', params.memberIdentifier));
        if (params.conditions) parts.push(params.conditions);

        const conditions = buildConditions(parts);
        const response = await cwmGet<unknown[]>('/expense/reports', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: conditions || undefined,
          orderBy: params.orderBy ?? 'dateSubmitted desc',
          fields: params.fields ?? (params.fullFields ? undefined : EXPENSE_REPORT_LIST_FIELDS),
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_expense_report ─────────────────────────────────────────────────
  server.tool(
    'cw_get_expense_report',
    `Get full details of an expense report by ID.
Calls GET /expense/reports/{id}.
Example: id=50`,
    {
      id: z.number().int().positive().describe('Expense report ID'),
    },
    async ({ id }) =>
      runTool('cw_get_expense_report', async () => {
        const response = await cwmGet<unknown>(`/expense/reports/${id}`);
        return success(response.data);
      })
  );

  // ─── cw_submit_expense_report ──────────────────────────────────────────────
  server.tool(
    'cw_submit_expense_report',
    `Submit an expense report for approval.
Calls POST /expense/reports/{id}/submit.
Example: id=50`,
    {
      id: z.number().int().positive().describe('Expense report ID'),
    },
    async ({ id }) =>
      runTool('cw_submit_expense_report', async () => {
        const response = await cwmPost<unknown>(`/expense/reports/${id}/submit`, {});
        return success(response.data);
      })
  );

  // ─── cw_approve_expense_report ─────────────────────────────────────────────
  server.tool(
    'cw_approve_expense_report',
    `Approve an expense report.
Calls POST /expense/reports/{id}/approve.
Example: id=50`,
    {
      id: z.number().int().positive().describe('Expense report ID'),
    },
    async ({ id }) =>
      runTool('cw_approve_expense_report', async () => {
        const response = await cwmPost<unknown>(`/expense/reports/${id}/approve`, {});
        return success(response.data);
      })
  );

  // ─── cw_reject_expense_report ──────────────────────────────────────────────
  server.tool(
    'cw_reject_expense_report',
    `Reject an expense report.
Calls POST /expense/reports/{id}/reject.
Example: id=50`,
    {
      id: z.number().int().positive().describe('Expense report ID'),
    },
    async ({ id }) =>
      runTool('cw_reject_expense_report', async () => {
        const response = await cwmPost<unknown>(`/expense/reports/${id}/reject`, {});
        return success(response.data);
      })
  );
}
