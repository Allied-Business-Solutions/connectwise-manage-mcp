import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cwmGet, cwmPost, cwmPatch } from '../client/cwmClient.js';
import { flatToJsonPatch } from '../client/jsonPatch.js';
import { buildConditions, eq, contains } from '../client/conditions.js';
import { success } from '../schemas/common.js';
import { runTool } from '../utils/toolRunner.js';

const CONTACT_LIST_FIELDS = 'id,firstName,lastName,company,site,title,defaultPhoneNbr,defaultEmailAddress,inactiveFlag';

export function registerContactTools(server: McpServer): void {

  // ─── cw_list_contacts ──────────────────────────────────────────────────────
  server.tool(
    'cw_list_contacts',
    `List contacts with optional filtering.
Calls GET /company/contacts.
Examples:
  - All contacts for a company: conditions="company/id=42"
  - Active contacts only: conditions="inactiveFlag=false"`,
    {
      conditions: z.string().optional(),
      orderBy: z.string().optional().default('lastName asc'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(25),
      fullFields: z.boolean().optional().default(false),
    },
    async ({ conditions, orderBy, page, pageSize, fullFields }) =>
      runTool('cw_list_contacts', async () => {
        const response = await cwmGet<unknown[]>('/company/contacts', {
          conditions,
          orderBy,
          page,
          pageSize,
          fields: fullFields ? undefined : CONTACT_LIST_FIELDS,
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_contact ────────────────────────────────────────────────────────
  server.tool(
    'cw_get_contact',
    `Get full details of a contact by ID.
Calls GET /company/contacts/{id}.
Example: id=100`,
    {
      id: z.number().int().positive().describe('Contact ID'),
    },
    async ({ id }) =>
      runTool('cw_get_contact', async () => {
        const response = await cwmGet<unknown>(`/company/contacts/${id}`);
        return success(response.data);
      })
  );

  // ─── cw_search_contacts ────────────────────────────────────────────────────
  server.tool(
    'cw_search_contacts',
    `Search contacts by company, name, or email.
Calls GET /company/contacts with built conditions.
Example: { companyId: 42, lastNameLike: "Smith" }`,
    {
      companyId: z.number().int().optional().describe('Filter by company ID'),
      firstNameLike: z.string().optional().describe('Partial first name match'),
      lastNameLike: z.string().optional().describe('Partial last name match'),
      emailLike: z.string().optional().describe('Partial email address match'),
      includeInactive: z.boolean().optional().default(false),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(25),
    },
    async (params) =>
      runTool('cw_search_contacts', async () => {
        const parts: string[] = [];
        if (params.companyId !== undefined) parts.push(eq('company/id', params.companyId));
        if (params.firstNameLike) parts.push(contains('firstName', params.firstNameLike));
        if (params.lastNameLike) parts.push(contains('lastName', params.lastNameLike));
        if (params.emailLike) parts.push(contains('defaultEmailAddress', params.emailLike));
        if (!params.includeInactive) parts.push(eq('inactiveFlag', false));

        const conditions = buildConditions(parts);
        const response = await cwmGet<unknown[]>('/company/contacts', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: conditions || undefined,
          orderBy: 'lastName asc',
          fields: CONTACT_LIST_FIELDS,
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_create_contact ─────────────────────────────────────────────────────
  server.tool(
    'cw_create_contact',
    `Create a new contact. company reference is strongly recommended.
Calls POST /company/contacts.
Example: { firstName: "Jane", lastName: "Doe", company: { id: 42 }, title: "IT Manager" }`,
    {
      firstName: z.string().optional().describe('First name'),
      lastName: z.string().optional().describe('Last name'),
      company: z.object({ id: z.number() }).optional().describe('Company reference'),
      title: z.string().optional(),
      site: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      relationship: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      department: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      communicationItems: z.array(z.object({
        type: z.object({ id: z.number().optional(), name: z.string().optional() }),
        value: z.string(),
        defaultFlag: z.boolean().optional(),
      })).optional().describe('Phone numbers, emails, etc.'),
    },
    async (params) =>
      runTool('cw_create_contact', async () => {
        const response = await cwmPost<unknown>('/company/contacts', params);
        return success(response.data);
      })
  );

  // ─── cw_update_contact ─────────────────────────────────────────────────────
  server.tool(
    'cw_update_contact',
    `Update a contact using JSON Patch.
Calls PATCH /company/contacts/{id}.
Example: { id: 100, changes: { title: "Senior IT Manager" } }`,
    {
      id: z.number().int().positive().describe('Contact ID'),
      changes: z.record(z.unknown()).describe('Fields to update'),
    },
    async ({ id, changes }) =>
      runTool('cw_update_contact', async () => {
        const patch = flatToJsonPatch(changes);
        const response = await cwmPatch<unknown>(`/company/contacts/${id}`, patch);
        return success(response.data);
      })
  );
}
