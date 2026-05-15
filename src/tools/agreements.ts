import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cwmGet, cwmPost, cwmPatch, cwmDelete } from '../client/cwmClient.js';
import { flatToJsonPatch } from '../client/jsonPatch.js';
import { buildConditions, eq, contains } from '../client/conditions.js';
import { ListParamsSchema, success } from '../schemas/common.js';
import { runTool } from '../utils/toolRunner.js';

const AGREEMENT_LIST_FIELDS = 'id,name,type,company,contact,startDate,endDate,cancelledFlag,noEndingDateFlag,expiredDays,billAmount,billCycleId,billTermsId,invoicingCycle';

export function registerAgreementTools(server: McpServer): void {

  // ─── cw_list_agreements ────────────────────────────────────────────────────
  server.tool(
    'cw_list_agreements',
    `List agreements with optional filtering.
Calls GET /finance/agreements.
Examples:
  - Active agreements: conditions="cancelledFlag=false"
  - AlliedSECURE agreements: conditions="type/name=\\"AlliedSECURE\\""
  - Agreements for a company: conditions="company/id=42"`,
    {
      ...ListParamsSchema.shape,
      companyId: z.number().int().optional().describe('Filter by company ID'),
      typeName: z.string().optional().describe('Filter by agreement type name'),
      includeExpired: z.boolean().optional().default(false),
      fullFields: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_list_agreements', async () => {
        const parts: string[] = [];
        if (params.companyId !== undefined) parts.push(eq('company/id', params.companyId));
        if (params.typeName) parts.push(eq('type/name', params.typeName));
        if (!params.includeExpired) parts.push(eq('cancelledFlag', false));
        if (params.conditions) parts.push(params.conditions);

        const conditions = buildConditions(parts);
        const response = await cwmGet<unknown[]>('/finance/agreements', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: conditions || undefined,
          orderBy: params.orderBy ?? 'name asc',
          fields: params.fields ?? (params.fullFields ? undefined : AGREEMENT_LIST_FIELDS),
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_agreement ──────────────────────────────────────────────────────
  server.tool(
    'cw_get_agreement',
    `Get full details of an agreement by ID.
Calls GET /finance/agreements/{id}.
Example: id=55`,
    {
      id: z.number().int().positive().describe('Agreement ID'),
    },
    async ({ id }) =>
      runTool('cw_get_agreement', async () => {
        const response = await cwmGet<unknown>(`/finance/agreements/${id}`);
        return success(response.data);
      })
  );

  // ─── cw_list_agreement_additions ──────────────────────────────────────────
  server.tool(
    'cw_list_agreement_additions',
    `List additions (line items) for an agreement.
Calls GET /finance/agreements/{parentId}/additions.
Example: agreementId=55`,
    {
      agreementId: z.number().int().positive().describe('Agreement ID'),
      conditions: z.string().optional(),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
      fullFields: z.boolean().optional().default(false),
    },
    async ({ agreementId, conditions, page, pageSize, fullFields }) =>
      runTool('cw_list_agreement_additions', async () => {
        const response = await cwmGet<unknown[]>(`/finance/agreements/${agreementId}/additions`, {
          conditions,
          page,
          pageSize,
          fields: fullFields
            ? undefined
            : 'id,product,quantity,unitPrice,billCustomer,effectiveDate,cancelledDate,uom,extPrice,prorateCurrentPeriodFlag,description,sequenceNumber',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_update_agreement_addition ─────────────────────────────────────────
  server.tool(
    'cw_update_agreement_addition',
    `Update an agreement addition (line item) using JSON Patch.
Calls PATCH /finance/agreements/{parentId}/additions/{id}.
Allied note: This tool is used for the AlliedSECURE agreement audit — updating prorateCurrentPeriodFlag is a key operation.
Example: { agreementId: 55, additionId: 10, changes: { quantity: 15, prorateCurrentPeriodFlag: true } }`,
    {
      agreementId: z.number().int().positive().describe('Agreement ID'),
      additionId: z.number().int().positive().describe('Addition (line item) ID'),
      changes: z.record(z.unknown()).describe('Fields to update. Common: quantity, unitPrice, prorateCurrentPeriodFlag, effectiveDate, cancelledDate'),
    },
    async ({ agreementId, additionId, changes }) =>
      runTool('cw_update_agreement_addition', async () => {
        const patch = flatToJsonPatch(changes);
        const response = await cwmPatch<unknown>(`/finance/agreements/${agreementId}/additions/${additionId}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_list_invoices ──────────────────────────────────────────────────────
  server.tool(
    'cw_list_invoices',
    `List invoices with optional filtering.
Calls GET /finance/invoices.
Examples:
  - Unpaid invoices: conditions="status/name=\\"Open\\""
  - Invoices for a company: conditions="company/id=42"`,
    {
      ...ListParamsSchema.shape,
      companyId: z.number().int().optional().describe('Filter by company ID'),
      statusName: z.string().optional().describe('Invoice status, e.g. "Open", "Closed"'),
      fullFields: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_list_invoices', async () => {
        const parts: string[] = [];
        if (params.companyId !== undefined) parts.push(eq('company/id', params.companyId));
        if (params.statusName) parts.push(eq('status/name', params.statusName));
        if (params.conditions) parts.push(params.conditions);

        const conditions = buildConditions(parts);
        const response = await cwmGet<unknown[]>('/finance/invoices', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: conditions || undefined,
          orderBy: params.orderBy ?? 'invoiceDate desc',
          fields: params.fields ?? (params.fullFields ? undefined : 'id,invoiceNumber,company,invoiceDate,dueDate,invoiceTotal,remainingDownPayment,status,type,billingStatus'),
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_invoice ────────────────────────────────────────────────────────
  server.tool(
    'cw_get_invoice',
    `Get full details of an invoice by ID.
Calls GET /finance/invoices/{id}.
Example: id=1234`,
    {
      id: z.number().int().positive().describe('Invoice ID'),
    },
    async ({ id }) =>
      runTool('cw_get_invoice', async () => {
        const response = await cwmGet<unknown>(`/finance/invoices/${id}`);
        return success(response.data);
      })
  );

  // ─── cw_create_agreement ───────────────────────────────────────────────────
  server.tool(
    'cw_create_agreement',
    `Create a new agreement. Required: name, type, company, contact.
Calls POST /finance/agreements.
Example: { name: "AlliedSECURE - Acme Corp", type: { name: "AlliedSECURE" }, company: { id: 42 }, contact: { id: 100 } }`,
    {
      name: z.string().min(1).describe('Agreement name'),
      type: z.object({ id: z.number().optional(), name: z.string().optional() }).describe('Agreement type reference'),
      company: z.object({ id: z.number() }).describe('Company reference'),
      contact: z.object({ id: z.number() }).describe('Contact reference'),
      startDate: z.string().optional().describe('ISO 8601 date'),
      endDate: z.string().optional().describe('ISO 8601 date'),
      noEndingDateFlag: z.boolean().optional(),
      opportunity: z.object({ id: z.number() }).optional(),
      internalNotes: z.string().optional(),
      location: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      department: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
    },
    async (params) =>
      runTool('cw_create_agreement', async () => {
        const response = await cwmPost<unknown>('/finance/agreements', params);
        return success(response.data);
      })
  );

  // ─── cw_update_agreement ───────────────────────────────────────────────────
  server.tool(
    'cw_update_agreement',
    `Update an agreement using JSON Patch.
Calls PATCH /finance/agreements/{id}.
Example: { id: 55, changes: { cancelledFlag: true, dateCancelled: "2025-06-01" } }`,
    {
      id: z.number().int().positive().describe('Agreement ID'),
      changes: z.record(z.unknown()).describe('Fields to update'),
    },
    async ({ id, changes }) =>
      runTool('cw_update_agreement', async () => {
        const patch = flatToJsonPatch(changes);
        const response = await cwmPatch<unknown>(`/finance/agreements/${id}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_delete_agreement ───────────────────────────────────────────────────
  server.tool(
    'cw_delete_agreement',
    `Delete an agreement permanently.
Calls DELETE /finance/agreements/{id}.
Example: id=55`,
    {
      id: z.number().int().positive().describe('Agreement ID'),
    },
    async ({ id }) =>
      runTool('cw_delete_agreement', async () => {
        await cwmDelete(`/finance/agreements/${id}`);
        return success({ deleted: true, id });
      })
  );

  // ─── cw_get_agreement_addition ─────────────────────────────────────────────
  server.tool(
    'cw_get_agreement_addition',
    `Get a single agreement addition (line item) by ID.
Calls GET /finance/agreements/{parentId}/additions/{id}.
Example: { agreementId: 55, additionId: 10 }`,
    {
      agreementId: z.number().int().positive().describe('Agreement ID'),
      additionId: z.number().int().positive().describe('Addition ID'),
    },
    async ({ agreementId, additionId }) =>
      runTool('cw_get_agreement_addition', async () => {
        const response = await cwmGet<unknown>(`/finance/agreements/${agreementId}/additions/${additionId}`);
        return success(response.data);
      })
  );

  // ─── cw_create_agreement_addition ─────────────────────────────────────────
  server.tool(
    'cw_create_agreement_addition',
    `Add a product line item to an agreement. Required: product.
Calls POST /finance/agreements/{parentId}/additions.
Example: { agreementId: 55, product: { id: 12 }, quantity: 10, unitPrice: 49.99 }`,
    {
      agreementId: z.number().int().positive().describe('Agreement ID'),
      product: z.object({ id: z.number().optional(), identifier: z.string().optional() }).describe('Product reference'),
      quantity: z.number().optional(),
      unitPrice: z.number().optional(),
      billCustomer: z.enum(['Billable', 'DoNotBill', 'NoCharge']).optional(),
      effectiveDate: z.string().optional().describe('ISO 8601 date'),
      cancelledDate: z.string().optional().describe('ISO 8601 date'),
      prorateCurrentPeriodFlag: z.boolean().optional(),
    },
    async (params) =>
      runTool('cw_create_agreement_addition', async () => {
        const { agreementId, ...body } = params;
        const response = await cwmPost<unknown>(`/finance/agreements/${agreementId}/additions`, body);
        return success(response.data);
      })
  );

  // ─── cw_delete_agreement_addition ─────────────────────────────────────────
  server.tool(
    'cw_delete_agreement_addition',
    `Delete an addition (line item) from an agreement permanently.
Calls DELETE /finance/agreements/{parentId}/additions/{id}.
Example: { agreementId: 55, additionId: 10 }`,
    {
      agreementId: z.number().int().positive().describe('Agreement ID'),
      additionId: z.number().int().positive().describe('Addition ID'),
    },
    async ({ agreementId, additionId }) =>
      runTool('cw_delete_agreement_addition', async () => {
        await cwmDelete(`/finance/agreements/${agreementId}/additions/${additionId}`);
        return success({ deleted: true, agreementId, additionId });
      })
  );
}
