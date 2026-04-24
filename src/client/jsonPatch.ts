/**
 * JSON Patch (RFC 6902) helpers.
 *
 * CWM PATCH uses RFC 6902 JSON Patch, NOT merge-patch.
 * ALWAYS use PATCH, not PUT — PUT requires ALL mandatory fields and will blank missing ones.
 *
 * Example:
 *   flatToJsonPatch({ summary: "New title", "status/id": 42 })
 *   => [
 *     { op: "replace", path: "/summary", value: "New title" },
 *     { op: "replace", path: "/status/id", value: 42 }
 *   ]
 */

export interface JsonPatchOp {
  op: 'replace' | 'add' | 'remove';
  path: string;
  value?: unknown;
}

/**
 * Convert a flat object of field changes into a JSON Patch array.
 *
 * Field names use dot or slash notation for nested paths:
 *   "status/id"     → /status/id
 *   "contact.id"    → /contact/id
 *   "summary"       → /summary
 */
export function flatToJsonPatch(changes: Record<string, unknown>): JsonPatchOp[] {
  return Object.entries(changes).map(([field, value]) => {
    // Normalize dot/slash separators to forward slash for RFC 6902 path
    const path = '/' + field.replace(/\./g, '/');
    if (value === undefined || value === null) {
      return { op: 'remove' as const, path };
    }
    return { op: 'replace' as const, path, value };
  });
}

/**
 * Convenience: patch a single field
 */
export function singlePatch(field: string, value: unknown): JsonPatchOp[] {
  return flatToJsonPatch({ [field]: value });
}
