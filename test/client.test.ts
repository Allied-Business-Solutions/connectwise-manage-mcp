import { describe, it, expect } from 'vitest';
import { buildAuthHeader } from '../src/client/cwmClient.js';
import { flatToJsonPatch, singlePatch } from '../src/client/jsonPatch.js';
import { buildConditions, eq, contains, inList, and, or, gt, lt } from '../src/client/conditions.js';
import { getCustomField, setCustomField, mergeCustomFields } from '../src/client/customFields.js';
import { parseCwmError, CwmApiError } from '../src/client/errors.js';

// ─── Auth header ──────────────────────────────────────────────────────────────
describe('buildAuthHeader', () => {
  it('encodes companyId+publicKey:privateKey as Basic base64', () => {
    const header = buildAuthHeader('MyCompany', 'pub123', 'priv456');
    const decoded = Buffer.from(header.replace('Basic ', ''), 'base64').toString();
    expect(decoded).toBe('MyCompany+pub123:priv456');
  });

  it('starts with "Basic "', () => {
    expect(buildAuthHeader('a', 'b', 'c')).toMatch(/^Basic /);
  });
});

// ─── JSON Patch ───────────────────────────────────────────────────────────────
describe('flatToJsonPatch', () => {
  it('converts flat fields to replace ops', () => {
    const patch = flatToJsonPatch({ summary: 'New title', 'status/id': 42 });
    expect(patch).toEqual([
      { op: 'replace', path: '/summary', value: 'New title' },
      { op: 'replace', path: '/status/id', value: 42 },
    ]);
  });

  it('uses dot notation as path separator', () => {
    const patch = flatToJsonPatch({ 'contact.id': 5 });
    expect(patch[0]).toEqual({ op: 'replace', path: '/contact/id', value: 5 });
  });

  it('emits remove op for null values', () => {
    const patch = flatToJsonPatch({ requiredDate: null });
    expect(patch[0]).toEqual({ op: 'remove', path: '/requiredDate' });
  });

  it('emits remove op for undefined values', () => {
    const patch = flatToJsonPatch({ requiredDate: undefined });
    expect(patch[0]).toEqual({ op: 'remove', path: '/requiredDate' });
  });
});

describe('singlePatch', () => {
  it('wraps a single field in a patch array', () => {
    expect(singlePatch('closedFlag', true)).toEqual([{ op: 'replace', path: '/closedFlag', value: true }]);
  });
});

// ─── Conditions ───────────────────────────────────────────────────────────────
describe('eq', () => {
  it('wraps strings in double quotes', () => {
    expect(eq('status/name', 'Open')).toBe('status/name="Open"');
  });

  it('formats booleans without quotes', () => {
    expect(eq('closedFlag', false)).toBe('closedFlag=false');
  });

  it('formats numbers without quotes', () => {
    expect(eq('id', 123)).toBe('id=123');
  });

  it('wraps dates in square brackets', () => {
    const d = new Date('2025-01-01T00:00:00Z');
    expect(eq('dateEntered', d)).toBe('dateEntered=[2025-01-01T00:00:00.000Z]');
  });
});

describe('contains', () => {
  it('wraps value in % wildcards', () => {
    expect(contains('summary', 'printer')).toBe('summary like "%printer%"');
  });
});

describe('inList', () => {
  it('formats numeric IDs', () => {
    expect(inList('id', [1, 2, 3])).toBe('id in (1,2,3)');
  });

  it('formats string values with quotes', () => {
    expect(inList('status/name', ['Open', 'In Progress'])).toBe('status/name in ("Open","In Progress")');
  });
});

describe('buildConditions', () => {
  it('joins non-empty parts with AND', () => {
    expect(buildConditions(['a=1', 'b=2'])).toBe('a=1 AND b=2');
  });

  it('filters out falsy values', () => {
    expect(buildConditions(['a=1', undefined, null, false, 'b=2'])).toBe('a=1 AND b=2');
  });

  it('returns empty string for all-falsy input', () => {
    expect(buildConditions([undefined, false])).toBe('');
  });
});

describe('gt/lt', () => {
  it('formats gt with date', () => {
    const d = new Date('2025-01-01T00:00:00Z');
    expect(gt('dateEntered', d)).toBe('dateEntered>[2025-01-01T00:00:00.000Z]');
  });

  it('formats lt with string date', () => {
    expect(lt('dateEntered', '2025-12-31')).toBe('dateEntered<"2025-12-31"');
  });
});

// ─── Custom fields ────────────────────────────────────────────────────────────
describe('getCustomField', () => {
  const record = {
    customFields: [
      { id: 1, caption: 'Contract Type', type: 'Text', entryMethod: 'EntryField', numberOfDecimals: 0, value: 'Managed' },
      { id: 2, caption: 'SLA Level', type: 'Text', entryMethod: 'EntryField', numberOfDecimals: 0, value: 'Gold' },
    ],
  };

  it('finds a field by caption', () => {
    expect(getCustomField(record, 'Contract Type')).toBe('Managed');
  });

  it('is case-insensitive', () => {
    expect(getCustomField(record, 'sla level')).toBe('Gold');
  });

  it('returns undefined for missing field', () => {
    expect(getCustomField(record, 'Nonexistent')).toBeUndefined();
  });

  it('returns undefined for record without customFields', () => {
    expect(getCustomField({}, 'Anything')).toBeUndefined();
  });
});

describe('setCustomField', () => {
  const record = {
    customFields: [
      { id: 1, caption: 'Status', type: 'Text', entryMethod: 'EntryField', numberOfDecimals: 0, value: 'Active' },
    ],
  };

  it('updates an existing field', () => {
    const result = setCustomField(record, 'Status', 'Inactive');
    expect(result.find((f) => f.caption === 'Status')?.value).toBe('Inactive');
  });

  it('does not mutate the original', () => {
    setCustomField(record, 'Status', 'Changed');
    expect(record.customFields[0]?.value).toBe('Active');
  });

  it('adds a new field when not found and fieldId provided', () => {
    const result = setCustomField(record, 'NewField', 'NewValue', 99);
    expect(result).toHaveLength(2);
    expect(result.find((f) => f.caption === 'NewField')?.value).toBe('NewValue');
  });

  it('throws when field not found and no fieldId', () => {
    expect(() => setCustomField(record, 'Ghost', 'x')).toThrow();
  });
});

describe('mergeCustomFields', () => {
  it('updates multiple fields at once', () => {
    const record = {
      customFields: [
        { id: 1, caption: 'A', type: 'Text', entryMethod: 'EntryField', numberOfDecimals: 0, value: '1' },
        { id: 2, caption: 'B', type: 'Text', entryMethod: 'EntryField', numberOfDecimals: 0, value: '2' },
      ],
    };
    const result = mergeCustomFields(record, { A: 'updated', B: 'also updated' });
    expect(result.find((f) => f.caption === 'A')?.value).toBe('updated');
    expect(result.find((f) => f.caption === 'B')?.value).toBe('also updated');
  });
});

// ─── Errors ───────────────────────────────────────────────────────────────────
describe('parseCwmError', () => {
  it('parses standard CWM error shape', () => {
    const err = parseCwmError(400, {
      code: 'InvalidObject',
      message: 'Validation failed',
      errors: [{ code: 'Required', message: 'summary is required', resource: 'Ticket' }],
    });
    expect(err).toBeInstanceOf(CwmApiError);
    expect(err.httpStatus).toBe(400);
    expect(err.code).toBe('InvalidObject');
    expect(err.errors).toHaveLength(1);
    expect(err.errors[0]?.resource).toBe('Ticket');
  });

  it('handles unexpected error shapes gracefully', () => {
    const err = parseCwmError(500, 'Internal Server Error');
    expect(err.code).toBe('UnknownError');
    expect(err.httpStatus).toBe(500);
  });

  it('handles null/empty body', () => {
    const err = parseCwmError(404, null);
    expect(err.httpStatus).toBe(404);
  });
});

describe('CwmApiError.toJSON', () => {
  it('serializes cleanly', () => {
    const err = new CwmApiError(404, 'NotFound', 'Not found', []);
    expect(err.toJSON()).toEqual({ code: 'NotFound', message: 'Not found', httpStatus: 404, details: [] });
  });
});
