/**
 * CWM condition string builders.
 *
 * CWM uses its own query language (NOT OData) for filtering:
 *   status/name="Open" AND board/name="Help Desk MS"
 *   id in (123,456)
 *   summary like "%printer%"
 *   dateEntered > [2025-01-01T00:00:00Z]
 *   closedFlag=false
 */

export type ConditionValue = string | number | boolean | Date | null;

/** Escape a string value for use in a CWM condition */
function escapeString(value: string): string {
  // CWM uses double-quoted strings; escape internal double quotes
  return value.replace(/"/g, '\\"');
}

/** Format a single value for use in a condition */
function formatValue(value: ConditionValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return `[${value.toISOString()}]`;
  return `"${escapeString(value)}"`;
}

/** field="value" or field=true etc */
export function eq(field: string, value: ConditionValue): string {
  return `${field}=${formatValue(value)}`;
}

/** field!="value" */
export function neq(field: string, value: ConditionValue): string {
  return `${field}!=${formatValue(value)}`;
}

/** field like "%value%" */
export function like(field: string, value: string): string {
  return `${field} like "${escapeString(value)}"`;
}

/** field contains "%value%" (convenience wrapper for like with wildcards) */
export function contains(field: string, value: string): string {
  return like(field, `%${value}%`);
}

/** field in (1,2,3) */
export function inList(field: string, values: (string | number)[]): string {
  const formatted = values.map((v) => (typeof v === 'string' ? `"${escapeString(v)}"` : String(v))).join(',');
  return `${field} in (${formatted})`;
}

/** field > [date] */
export function gt(field: string, value: ConditionValue): string {
  return `${field}>${formatValue(value)}`;
}

/** field >= [date] */
export function gte(field: string, value: ConditionValue): string {
  return `${field}>=${formatValue(value)}`;
}

/** field < [date] */
export function lt(field: string, value: ConditionValue): string {
  return `${field}<${formatValue(value)}`;
}

/** field <= [date] */
export function lte(field: string, value: ConditionValue): string {
  return `${field}<=${formatValue(value)}`;
}

/** Combine conditions with AND */
export function and(...conditions: string[]): string {
  return conditions.filter(Boolean).join(' AND ');
}

/** Combine conditions with OR */
export function or(...conditions: string[]): string {
  return `(${conditions.filter(Boolean).join(' OR ')})`;
}

/**
 * Build a conditions string from an array of optional condition fragments.
 * Undefined/empty fragments are filtered out.
 */
export function buildConditions(parts: (string | undefined | null | false)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' AND ');
}
