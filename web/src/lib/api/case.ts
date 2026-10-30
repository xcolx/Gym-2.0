// Like the iOS APIClient (.convertToSnakeCase), the keys of every JSON body are converted. No payload of the API uses
// data as object keys, so converting every key is safe.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** "client_uuid" → "clientUuid" */
function camelCaseKey(key: string): string {
  return key.replace(/_+([a-z0-9])/g, (_, character: string) => character.toUpperCase());
}

/** "clientUuid" → "client_uuid" */
function snakeCaseKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** Response bodies: every key to camelCase */
export function keysToCamelCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(keysToCamelCase);
  if (!isPlainObject(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[camelCaseKey(key)] = keysToCamelCase(entry);
  }
  return result;
}

/**
 * Request bodies: every key to snake_case. Properties that are `null` or `undefined` are left out, like Swift's
 * synthesized Encodable does for nil optionals: the update endpoints only change the fields that are sent and
 * reject explicit nulls. Dates are sent as ISO 8601 strings with time zone (Z).
 */
export function keysToSnakeCase(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(keysToSnakeCase);
  if (!isPlainObject(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || entry === undefined) continue;
    result[snakeCaseKey(key)] = keysToSnakeCase(entry);
  }
  return result;
}
