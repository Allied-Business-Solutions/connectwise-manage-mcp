/**
 * Custom field helpers for CWM records.
 *
 * Custom fields are an array on the record:
 *   customFields: [{ id, caption, type, entryMethod, numberOfDecimals, value }, ...]
 *
 * IMPORTANT on writes: Send the FULL customFields array with modified values.
 * Omitting fields from the array will CLEAR them. Always merge-then-send.
 */

export interface CustomField {
  id: number;
  caption: string;
  type?: string;
  entryMethod?: string;
  numberOfDecimals?: number;
  value: unknown;
}

export interface RecordWithCustomFields {
  customFields?: CustomField[];
}

/**
 * Get the value of a custom field by caption (case-insensitive).
 * Returns undefined if not found.
 */
export function getCustomField(record: RecordWithCustomFields, caption: string): unknown {
  const field = record.customFields?.find(
    (f) => f.caption.toLowerCase() === caption.toLowerCase()
  );
  return field?.value;
}

/**
 * Produce a new customFields array with the specified field updated.
 * If the field doesn't exist, it is added (you must provide the id).
 *
 * ALWAYS pass the result of this to your PATCH/PUT — never send a partial array.
 */
export function setCustomField(
  record: RecordWithCustomFields,
  caption: string,
  value: unknown,
  fieldId?: number
): CustomField[] {
  const existing = record.customFields ?? [];
  const idx = existing.findIndex((f) => f.caption.toLowerCase() === caption.toLowerCase());

  if (idx === -1) {
    if (fieldId === undefined) {
      throw new Error(`Custom field "${caption}" not found on record and no fieldId provided`);
    }
    return [...existing, { id: fieldId, caption, value }];
  }

  return existing.map((f, i) => (i === idx ? { ...f, value } : f));
}

/**
 * Merge multiple custom field updates into a single array suitable for a PATCH body.
 */
export function mergeCustomFields(
  record: RecordWithCustomFields,
  updates: Record<string, unknown>
): CustomField[] {
  let fields = record.customFields ? [...record.customFields] : [];
  for (const [caption, value] of Object.entries(updates)) {
    const idx = fields.findIndex((f) => f.caption.toLowerCase() === caption.toLowerCase());
    if (idx !== -1) {
      fields = fields.map((f, i) => (i === idx ? { ...f, value } : f));
    }
  }
  return fields;
}
