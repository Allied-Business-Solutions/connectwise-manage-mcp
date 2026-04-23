# ConnectWise Manage MCP Server

An MCP (Model Context Protocol) server that exposes the ConnectWise Manage PSA REST API to Claude, enabling IT engineers to work tickets, manage projects, log time, and query data through natural language.

## Features

- **75 tools** across 9 modules: Tickets, Projects, Time & Schedule, Companies, Contacts, Agreements, Configurations, Opportunities, System
- **4 raw escape-hatch tools** (opt-in via `CWM_ENABLE_RAW_TOOLS=true`) for power users
- Production-grade auth with correct Basic + clientId header construction
- JSON Patch (RFC 6902) for all updates — never accidentally blanks fields
- Built-in pagination, retry on 429 rate limits, and structured error responses
- Strict TypeScript, zod-validated inputs, pino logging to stderr

## Prerequisites

- Node.js 20 LTS or newer
- A ConnectWise Manage API member with the following roles/permissions:
  - **Service**: View, Add, Edit (tickets, notes, tasks)
  - **Project**: View, Add, Edit
  - **Time**: View, Add, Edit, Delete (time entries)
  - **Company**: View, Edit (companies, contacts, configurations)
  - **Finance**: View, Edit (agreements, invoices — read-only on invoices)
  - **Sales**: View, Edit (opportunities)
  - **System**: View (members, locations, departments)
- A registered developer Client ID from [developer.connectwise.com](https://developer.connectwise.com)

## Installation (Windows)

### 1. Install Node.js 20

Download and install from [nodejs.org](https://nodejs.org/).

### 2. Clone and build

```cmd
git clone <repo-url> C:\Users\YOUR_USERNAME\AppData\Local\Programs\ConnectWiseMCP
cd C:\Users\YOUR_USERNAME\AppData\Local\Programs\ConnectWiseMCP
npm install
npm run build
```

### 3. Create your `.env` file

Copy `.env.example` to `.env` in the same directory and fill in your values:

```
CWM_SITE=your-cwm-instance.example.com
CWM_COMPANY_ID=YourCompanyId
CWM_PUBLIC_KEY=your_public_key
CWM_PRIVATE_KEY=your_private_key
CWM_CLIENT_ID=your-client-id-guid
```

### 4. Configure Claude Desktop

Add the following to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "connectwise": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\AppData\\Local\\Programs\\ConnectWiseMCP\\dist\\index.js"],
      "env": {
        "CWM_SITE": "your-cwm-instance.example.com",
        "CWM_COMPANY_ID": "YourCompanyId",
        "CWM_PUBLIC_KEY": "your_public_key",
        "CWM_PRIVATE_KEY": "your_private_key",
        "CWM_CLIENT_ID": "your-client-id-guid"
      }
    }
  }
}
```

Replace `YOUR_USERNAME` with your Windows username. Restart Claude Desktop after saving.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CWM_SITE` | Yes | CWM hostname, e.g. `your-cwm-instance.example.com` (no https://) |
| `CWM_COMPANY_ID` | Yes | Login company ID (not a numeric ID) |
| `CWM_PUBLIC_KEY` | Yes | API member public key from System > Members > API Keys |
| `CWM_PRIVATE_KEY` | Yes | API member private key |
| `CWM_CLIENT_ID` | Yes | Developer app GUID from developer.connectwise.com |
| `CWM_ENABLE_RAW_TOOLS` | No | Set `true` to enable raw escape-hatch tools (default: `false`) |
| `CWM_MAX_PAGES` | No | Max pages for paginateAll (default: `20`) |
| `LOG_LEVEL` | No | Pino log level: `debug`, `info`, `warn`, `error` (default: `info`) |

## Known Limitations & Gotchas

### 1. Auth header format (most common source of 401s)

The username is `CompanyId+PublicKey:PrivateKey` — the `+` between company ID and public key is **literal**, not URL-encoded. Missing the `+` is the most common cause of `401 Unauthorized` with misleading error messages. The `clientId` header is also mandatory — requests without it return 401.

### 2. Conditions query language (NOT OData)

CWM uses its own filter syntax:
- Strings use **double quotes**: `status/name="Open"` ✓ (NOT single quotes)
- Booleans are unquoted lowercase: `closedFlag=false`
- Dates use **square brackets**: `dateEntered>[2025-01-01T00:00:00Z]`
- Nested field references use `/`: `status/name`, `company/id`

### 3. PATCH uses RFC 6902 JSON Patch

CWM PATCH does **not** accept a partial merge object. It requires a JSON Patch array:
```json
[{ "op": "replace", "path": "/summary", "value": "New title" }]
```
All update tools in this server handle this automatically via the `flatToJsonPatch()` helper. **Do not use PUT** — it replaces the whole record and will blank fields you don't include.

### 4. Nested resource paths use `{parentId}`

Sub-resource endpoints use `{parentId}` for the parent, not `{id}`:
- Correct: `/service/tickets/{parentId}/notes`
- Wrong: `/service/tickets/{id}/notes`

This is the spec convention — all tools in this server use the correct paths.

### 5. Status IDs are board-specific

Status IDs vary per service board. Use `cw_list_board_statuses` to get valid IDs for a board before changing status. The convenience tool `cw_change_ticket_status` handles this lookup automatically.

**Note**: Board status values are board-specific. Verify the correct status name for your service board before changing status. Use `cw_list_board_statuses` to check available statuses.

### 6. Custom fields — always send the full array

When updating custom fields, you must send the **full** `customFields` array including unchanged fields. Omitting a field from the array **clears it**. Use `mergeCustomFields()` helper when patching custom field values.

### 7. Pagination

CWM does not return a total count by default. Use `cw_count_tickets` (or equivalent count endpoints) to get totals before paginating. Default page size is 25; maximum is 1000. `paginateAll()` caps at `CWM_MAX_PAGES` (default 20) to prevent runaway requests.

### 8. 429 Rate Limits

The server automatically retries on 429 with exponential backoff (up to 3 retries, respects `Retry-After` header). If you hit sustained rate limits, increase spacing between tool calls.

### 9. Agreement Audit

When auditing agreements, use `cw_list_agreements` with appropriate `typeName` filter to enumerate agreements, then `cw_list_agreement_additions` and `cw_update_agreement_addition` to adjust quantities/prorate flags. The `prorateCurrentPeriodFlag` field on additions controls whether mid-period changes are prorated.

## Tool Index

### Service Desk — Tickets (20 tools)
| Tool | Description |
|---|---|
| `cw_list_tickets` | List tickets with full filter/pagination support |
| `cw_search_tickets` | Search tickets by board, status, assignee, company, summary |
| `cw_get_ticket` | Get full ticket detail by ID |
| `cw_count_tickets` | Count tickets matching a condition |
| `cw_create_ticket` | Create a new service ticket |
| `cw_update_ticket` | Update ticket fields via JSON Patch |
| `cw_list_ticket_notes` | List notes on a ticket |
| `cw_add_ticket_note` | Add a note to a ticket |
| `cw_list_ticket_tasks` | List checklist tasks on a ticket |
| `cw_add_ticket_task` | Add a task to a ticket |
| `cw_update_ticket_task` | Update a ticket task |
| `cw_complete_ticket_task` | Mark a task as completed |
| `cw_list_ticket_time_entries` | List time entries on a ticket |
| `cw_list_ticket_configurations` | List assets attached to a ticket |
| `cw_list_ticket_documents` | List documents/attachments on a ticket |
| `cw_change_ticket_status` | Change ticket status by name (auto-resolves ID) |
| `cw_assign_ticket` | Assign ticket to a member by username |
| `cw_merge_tickets` | Merge source ticket into target ticket |
| `cw_list_boards` | List all service boards |
| `cw_list_board_statuses` | List valid statuses for a board |
| `cw_list_board_types` | List ticket types for a board |

### Projects (15 tools)
| Tool | Description |
|---|---|
| `cw_list_projects` | List projects with filtering |
| `cw_get_project` | Get full project detail |
| `cw_create_project` | Create a project |
| `cw_update_project` | Update project fields |
| `cw_list_project_phases` | List phases for a project |
| `cw_get_project_phase` | Get a single phase |
| `cw_create_project_phase` | Create a project phase |
| `cw_update_project_phase` | Update a phase |
| `cw_list_project_tickets` | List tickets in a project |
| `cw_create_project_ticket` | Create a ticket within a project |
| `cw_list_project_workplan` | Get full phase+ticket workplan tree |
| `cw_list_project_notes` | List project notes |
| `cw_add_project_note` | Add a note to a project |
| `cw_list_project_contacts` | List project contacts |
| `cw_list_project_team_members` | List project team members |

### Time & Schedule (8 tools)
| Tool | Description |
|---|---|
| `cw_list_time_entries` | List time entries with filters |
| `cw_get_time_entry` | Get a time entry by ID |
| `cw_create_time_entry` | Log time against a ticket or project |
| `cw_update_time_entry` | Update a time entry |
| `cw_delete_time_entry` | Delete a time entry |
| `cw_list_schedule_entries` | List schedule/dispatch appointments |
| `cw_create_schedule_entry` | Create a schedule entry |
| `cw_list_members` | List active CWM members |
| `cw_get_member` | Get a member by ID |

### Companies (6 tools)
| Tool | Description |
|---|---|
| `cw_list_companies` | List companies |
| `cw_get_company` | Get a company by ID |
| `cw_search_companies` | Search by name, identifier, city, status |
| `cw_update_company` | Update company fields |
| `cw_list_company_sites` | List sites for a company |
| `cw_list_company_notes` | List notes on a company |
| `cw_add_company_note` | Add a note to a company |

### Contacts (5 tools)
| Tool | Description |
|---|---|
| `cw_list_contacts` | List contacts |
| `cw_get_contact` | Get a contact by ID |
| `cw_search_contacts` | Search by company, name, email |
| `cw_create_contact` | Create a contact |
| `cw_update_contact` | Update a contact |

### Agreements & Finance (6 tools)
| Tool | Description |
|---|---|
| `cw_list_agreements` | List agreements |
| `cw_get_agreement` | Get an agreement by ID |
| `cw_list_agreement_additions` | List additions for an agreement |
| `cw_update_agreement_addition` | Update an addition (incl. prorateFlag) |
| `cw_list_invoices` | List invoices |
| `cw_get_invoice` | Get an invoice by ID |

### Configurations (5 tools)
| Tool | Description |
|---|---|
| `cw_list_configurations` | List managed assets |
| `cw_get_configuration` | Get an asset by ID |
| `cw_create_configuration` | Create a configuration record |
| `cw_update_configuration` | Update a configuration |
| `cw_list_configuration_types` | List configuration types |

### Opportunities (4 tools)
| Tool | Description |
|---|---|
| `cw_list_opportunities` | List sales opportunities |
| `cw_get_opportunity` | Get an opportunity by ID |
| `cw_list_opportunity_notes` | List opportunity notes |
| `cw_update_opportunity` | Update an opportunity |

### System / Reference (6 tools)
| Tool | Description |
|---|---|
| `cw_ping` | Health check — verify connectivity and auth |
| `cw_list_work_types` | List time entry work types |
| `cw_list_work_roles` | List time entry work roles |
| `cw_list_priorities` | List ticket priorities |
| `cw_list_locations` | List system locations |
| `cw_list_departments` | List departments |

### Raw Escape Hatches (4 tools, opt-in)
| Tool | Description |
|---|---|
| `cw_raw_get` | GET any API path |
| `cw_raw_post` | POST any API path |
| `cw_raw_patch` | PATCH any API path with JSON Patch |
| `cw_raw_delete` | DELETE any API path |

## Troubleshooting

**401 Unauthorized**
- Check that `clientId` is set (required for every request)
- Confirm the Basic auth format: `CompanyId+PublicKey:PrivateKey` — the `+` must be literal
- Verify the API member is active and has API Keys configured

**404 Not Found**
- Confirm `CWM_SITE` does not include `https://` or a trailing slash
- The API base path is `/v4_6_release/apis/3.0/` — this is set automatically

**Empty results when you expect data**
- Check your conditions syntax: strings need double quotes, booleans are lowercase unquoted
- Verify field names use `/` for nested paths: `status/name` not `status.name`

**PATCH does nothing**
- All update tools use JSON Patch — verify you're passing `changes` not a full object
- Check the field path: nested fields need `/`, e.g. `"status/id": 42`

**Rate limited (429)**
- The server retries automatically up to 3 times with backoff
- If sustained, reduce request frequency or increase gaps between tool calls

## Development

```cmd
# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Type check only
npm run lint

# Smoke test (requires real credentials)
set SMOKE_TEST=1 && npm run smoke
```
