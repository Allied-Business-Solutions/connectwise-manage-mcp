import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cwmGet, cwmPost, cwmPatch } from '../client/cwmClient.js';
import { flatToJsonPatch } from '../client/jsonPatch.js';
import { buildConditions, eq, contains } from '../client/conditions.js';
import { ListParamsSchema, success } from '../schemas/common.js';
import { runTool } from '../utils/toolRunner.js';

const PROJECT_LIST_FIELDS = 'id,name,status,company,board,manager,billingMethod,estimatedStart,estimatedEnd,actualStart,actualEnd,percentComplete,budgetHours,actualHours';

export function registerProjectTools(server: McpServer): void {

  // ─── cw_list_projects ──────────────────────────────────────────────────────
  server.tool(
    'cw_list_projects',
    `List projects with optional filtering.
Calls GET /project/projects.
Examples:
  - Active projects: conditions="status/name=\\"Open\\""
  - Projects for a company: conditions="company/name=\\"Acme Corp\\""`,
    {
      ...ListParamsSchema.shape,
      companyName: z.string().optional().describe('Filter by company name'),
      statusName: z.string().optional().describe('Filter by status name'),
      managerIdentifier: z.string().optional().describe('Filter by manager member identifier'),
      fullFields: z.boolean().optional().default(false),
    },
    async (params) =>
      runTool('cw_list_projects', async () => {
        const parts: string[] = [];
        if (params.companyName) parts.push(eq('company/name', params.companyName));
        if (params.statusName) parts.push(eq('status/name', params.statusName));
        if (params.managerIdentifier) parts.push(eq('manager/identifier', params.managerIdentifier));
        if (params.conditions) parts.push(params.conditions);

        const conditions = buildConditions(parts);
        const response = await cwmGet<unknown[]>('/project/projects', {
          page: params.page,
          pageSize: params.pageSize,
          conditions: conditions || undefined,
          orderBy: params.orderBy,
          fields: params.fields ?? (params.fullFields ? undefined : PROJECT_LIST_FIELDS),
        });
        return success(response.data, { page: params.page, pageSize: params.pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_project ────────────────────────────────────────────────────────
  server.tool(
    'cw_get_project',
    `Get full details of a project by ID.
Calls GET /project/projects/{id}.
Example: id=42`,
    {
      id: z.number().int().positive().describe('Project ID'),
    },
    async ({ id }) =>
      runTool('cw_get_project', async () => {
        const response = await cwmGet<unknown>(`/project/projects/${id}`);
        return success(response.data);
      })
  );

  // ─── cw_create_project ─────────────────────────────────────────────────────
  server.tool(
    'cw_create_project',
    `Create a new project. Required fields: name, company, board, billingMethod, estimatedStart, estimatedEnd.
Calls POST /project/projects.
Example: { name: "Network Upgrade", company: { id: 42 }, board: { id: 3 }, billingMethod: "ActualRates", estimatedStart: "2025-01-01", estimatedEnd: "2025-03-31" }`,
    {
      name: z.string().min(1).describe('Project name'),
      company: z.object({ id: z.number() }).describe('Company reference'),
      board: z.object({ id: z.number().optional(), name: z.string().optional() }).describe('Service board'),
      billingMethod: z.enum(['ActualRates', 'FixedFee', 'NotToExceed', 'OverrideRate']).describe('Billing method'),
      estimatedStart: z.string().describe('ISO 8601 date, e.g. 2025-01-01'),
      estimatedEnd: z.string().describe('ISO 8601 date, e.g. 2025-03-31'),
      manager: z.object({ id: z.number().optional(), identifier: z.string().optional() }).optional(),
      contact: z.object({ id: z.number() }).optional(),
      description: z.string().optional(),
      budgetHours: z.number().optional(),
      budgetAmount: z.number().optional(),
      department: z.object({ id: z.number() }).optional(),
      location: z.object({ id: z.number() }).optional(),
      status: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
    },
    async (params) =>
      runTool('cw_create_project', async () => {
        const response = await cwmPost<unknown>('/project/projects', params);
        return success(response.data);
      })
  );

  // ─── cw_update_project ─────────────────────────────────────────────────────
  server.tool(
    'cw_update_project',
    `Update a project using JSON Patch. Send only the fields to change.
Calls PATCH /project/projects/{id}.
Example: { id: 42, changes: { "status/name": "Closed" } }`,
    {
      id: z.number().int().positive().describe('Project ID'),
      changes: z.record(z.unknown()).describe('Fields to update, e.g. { "status/id": 5, name: "New Name" }'),
    },
    async ({ id, changes }) =>
      runTool('cw_update_project', async () => {
        const patch = flatToJsonPatch(changes);
        const response = await cwmPatch<unknown>(`/project/projects/${id}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_list_project_phases ────────────────────────────────────────────────
  server.tool(
    'cw_list_project_phases',
    `List phases for a project.
Calls GET /project/projects/{parentId}/phases.
Example: projectId=42`,
    {
      projectId: z.number().int().positive().describe('Project ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
      conditions: z.string().optional(),
    },
    async ({ projectId, page, pageSize, conditions }) =>
      runTool('cw_list_project_phases', async () => {
        const response = await cwmGet<unknown[]>(`/project/projects/${projectId}/phases`, {
          page,
          pageSize,
          conditions,
          fields: 'id,description,status,scheduledStart,scheduledEnd,actualStart,actualEnd,scheduledHours,actualHours,percentComplete,wbsCode',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_get_project_phase ──────────────────────────────────────────────────
  server.tool(
    'cw_get_project_phase',
    `Get full details of a single project phase.
Calls GET /project/projects/{parentId}/phases/{id}.
Example: { projectId: 42, phaseId: 7 }`,
    {
      projectId: z.number().int().positive().describe('Project ID'),
      phaseId: z.number().int().positive().describe('Phase ID'),
    },
    async ({ projectId, phaseId }) =>
      runTool('cw_get_project_phase', async () => {
        const response = await cwmGet<unknown>(`/project/projects/${projectId}/phases/${phaseId}`);
        return success(response.data);
      })
  );

  // ─── cw_create_project_phase ───────────────────────────────────────────────
  server.tool(
    'cw_create_project_phase',
    `Create a phase for a project. Required: description.
Calls POST /project/projects/{parentId}/phases.
Example: { projectId: 42, description: "Phase 1 - Discovery", scheduledStart: "2025-01-01", scheduledEnd: "2025-01-31" }`,
    {
      projectId: z.number().int().positive().describe('Project ID'),
      description: z.string().min(1).describe('Phase description / name'),
      scheduledStart: z.string().optional().describe('ISO 8601 date'),
      scheduledEnd: z.string().optional().describe('ISO 8601 date'),
      deadlineDate: z.string().optional().describe('ISO 8601 date'),
      scheduledHours: z.number().optional(),
      budgetHours: z.number().optional(),
      notes: z.string().optional(),
      markAsMilestoneFlag: z.boolean().optional(),
      status: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      board: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
    },
    async (params) =>
      runTool('cw_create_project_phase', async () => {
        const { projectId, ...body } = params;
        const response = await cwmPost<unknown>(`/project/projects/${projectId}/phases`, body);
        return success(response.data);
      })
  );

  // ─── cw_update_project_phase ───────────────────────────────────────────────
  server.tool(
    'cw_update_project_phase',
    `Update a project phase using JSON Patch.
Calls PATCH /project/projects/{parentId}/phases/{id}.
Example: { projectId: 42, phaseId: 7, changes: { description: "Phase 1 - Discovery (revised)" } }`,
    {
      projectId: z.number().int().positive().describe('Project ID'),
      phaseId: z.number().int().positive().describe('Phase ID'),
      changes: z.record(z.unknown()).describe('Fields to update'),
    },
    async ({ projectId, phaseId, changes }) =>
      runTool('cw_update_project_phase', async () => {
        const patch = flatToJsonPatch(changes);
        const response = await cwmPatch<unknown>(`/project/projects/${projectId}/phases/${phaseId}`, patch);
        return success(response.data);
      })
  );

  // ─── cw_list_project_tickets ───────────────────────────────────────────────
  server.tool(
    'cw_list_project_tickets',
    `List tickets attached to a project.
Calls GET /project/tickets with conditions filter on project id.
Example: projectId=42`,
    {
      projectId: z.number().int().positive().describe('Project ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
      conditions: z.string().optional().describe('Additional conditions to AND with project filter'),
      orderBy: z.string().optional(),
    },
    async ({ projectId, page, pageSize, conditions, orderBy }) =>
      runTool('cw_list_project_tickets', async () => {
        const baseCondition = eq('project/id', projectId);
        const fullConditions = conditions ? and(baseCondition, conditions) : baseCondition;
        const response = await cwmGet<unknown[]>('/project/tickets', {
          page,
          pageSize,
          conditions: fullConditions,
          orderBy,
          fields: 'id,summary,status,phase,priority,owner,budgetHours,actualHours,scheduledStart,scheduledEnd',
        });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_create_project_ticket ──────────────────────────────────────────────
  server.tool(
    'cw_create_project_ticket',
    `Create a ticket within a project.
Calls POST /project/tickets.
Example: { projectId: 42, phaseId: 7, summary: "Install firewall", budgetHours: 4 }`,
    {
      projectId: z.number().int().positive().describe('Project ID'),
      summary: z.string().min(1).describe('Ticket summary'),
      phase: z.object({ id: z.number() }).optional().describe('Phase reference'),
      priority: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
      owner: z.object({ id: z.number().optional(), identifier: z.string().optional() }).optional(),
      budgetHours: z.number().optional(),
      scheduledStart: z.string().optional().describe('ISO 8601 date'),
      scheduledEnd: z.string().optional().describe('ISO 8601 date'),
      notes: z.string().optional(),
    },
    async (params) =>
      runTool('cw_create_project_ticket', async () => {
        const { projectId, ...rest } = params;
        const body = { ...rest, project: { id: projectId } };
        const response = await cwmPost<unknown>('/project/tickets', body);
        return success(response.data);
      })
  );

  // ─── cw_list_project_workplan ──────────────────────────────────────────────
  server.tool(
    'cw_list_project_workplan',
    `Get the full workplan (phases + tickets/tasks tree) for a project.
Calls GET /project/projects/{id}/projectWorkplan.
Example: id=42`,
    {
      id: z.number().int().positive().describe('Project ID'),
    },
    async ({ id }) =>
      runTool('cw_list_project_workplan', async () => {
        const response = await cwmGet<unknown>(`/project/projects/${id}/projectWorkplan`);
        return success(response.data);
      })
  );

  // ─── cw_list_project_notes ─────────────────────────────────────────────────
  server.tool(
    'cw_list_project_notes',
    `List notes on a project.
Calls GET /project/projects/{parentId}/notes.
Example: projectId=42`,
    {
      projectId: z.number().int().positive().describe('Project ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ projectId, page, pageSize }) =>
      runTool('cw_list_project_notes', async () => {
        const response = await cwmGet<unknown[]>(`/project/projects/${projectId}/notes`, { page, pageSize });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_add_project_note ───────────────────────────────────────────────────
  server.tool(
    'cw_add_project_note',
    `Add a note to a project. Required: text.
Calls POST /project/projects/{parentId}/notes.
Example: { projectId: 42, text: "Customer approved phase 2 scope", flagged: false }`,
    {
      projectId: z.number().int().positive().describe('Project ID'),
      text: z.string().min(1).describe('Note text'),
      flagged: z.boolean().optional().default(false).describe('Flag the note for attention'),
      type: z.object({ id: z.number().optional(), name: z.string().optional() }).optional(),
    },
    async (params) =>
      runTool('cw_add_project_note', async () => {
        const { projectId, ...body } = params;
        const response = await cwmPost<unknown>(`/project/projects/${projectId}/notes`, body);
        return success(response.data);
      })
  );

  // ─── cw_list_project_contacts ──────────────────────────────────────────────
  server.tool(
    'cw_list_project_contacts',
    `List contacts associated with a project.
Calls GET /project/projects/{parentId}/contacts.
Example: projectId=42`,
    {
      projectId: z.number().int().positive().describe('Project ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ projectId, page, pageSize }) =>
      runTool('cw_list_project_contacts', async () => {
        const response = await cwmGet<unknown[]>(`/project/projects/${projectId}/contacts`, { page, pageSize });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_list_project_team_members ─────────────────────────────────────────
  server.tool(
    'cw_list_project_team_members',
    `List team members on a project.
Calls GET /project/projects/{parentId}/teamMembers.
Example: projectId=42`,
    {
      projectId: z.number().int().positive().describe('Project ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ projectId, page, pageSize }) =>
      runTool('cw_list_project_team_members', async () => {
        const response = await cwmGet<unknown[]>(`/project/projects/${projectId}/teamMembers`, { page, pageSize });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );

  // ─── cw_list_project_documents ─────────────────────────────────────────────
  server.tool(
    'cw_list_project_documents',
    `List documents/attachments on a project.
Calls GET /system/documents?recordType=Project&recordId={projectId}.
Example: projectId=42`,
    {
      projectId: z.number().int().positive().describe('Project ID'),
      page: z.number().int().positive().optional().default(1),
      pageSize: z.number().int().min(1).max(1000).optional().default(50),
    },
    async ({ projectId, page, pageSize }) =>
      runTool('cw_list_project_documents', async () => {
        const response = await cwmGet<unknown[]>('/system/documents', { recordType: 'Project', recordId: projectId, page, pageSize });
        return success(response.data, { page, pageSize, count: response.data.length });
      })
  );
}

// Local helper used in project tickets
function and(a: string, b: string): string {
  return `${a} AND ${b}`;
}
