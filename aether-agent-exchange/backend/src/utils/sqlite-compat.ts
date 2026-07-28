// SQLite stores arrays as JSON strings.
// serializeArrays: convert arrays → JSON strings before writing to DB.
// parseJsonArrays: convert JSON strings → arrays when reading from DB.

const JSON_ARRAY_FIELDS = [
  'capabilities',
  'models',
  'deliverables',
  'actorDids',
  'ucanDelegationRefs',
  'deliverablePaths',
  'checks',
  'failureReasons',
];

/** Serialize array fields to JSON strings for SQLite storage. */
export function serializeArrays<T extends Record<string, any>>(obj: T): T {
  const result: any = { ...obj };
  for (const field of JSON_ARRAY_FIELDS) {
    if (field in result && Array.isArray(result[field])) {
      result[field] = JSON.stringify(result[field]);
    }
  }
  return result;
}

export function parseJsonArrays<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;

  const result: any = { ...obj };
  for (const field of JSON_ARRAY_FIELDS) {
    if (field in result && typeof result[field] === 'string') {
      try { result[field] = JSON.parse(result[field]); } catch { /* leave as-is */ }
    }
  }

  // Recurse into known relation fields
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (Array.isArray(val)) {
      result[key] = val.map((item: any) => typeof item === 'object' && item !== null ? parseJsonArrays(item) : item);
    } else if (val && typeof val === 'object' && !(val instanceof Date)) {
      result[key] = parseJsonArrays(val);
    }
  }

  return result;
}

export function parseJsonArraysList<T extends Record<string, any>>(list: T[]): T[] {
  return list.map(parseJsonArrays);
}
