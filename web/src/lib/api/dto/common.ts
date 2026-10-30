// Keys are camelCase (the client converts them from and to the snake_case of the backend). Dates stay ISO 8601
// strings as the server sent them, lib/api/mapping.ts converts them to Date.

/** An ISO 8601 date with time zone, e.g. "2026-10-15T08:30:00.123456+00:00" */
export type ISODateString = string;

export type UUIDString = string;

/**
 * The type of a change in a delta (GET /<type>/delta). Created and updated should both be treated as an upsert, and
 * deletions of unknown ids ignored, because a change can be delivered more than once.
 */
export const ChangeAction = { created: 0, updated: 1, deleted: 2 } as const;
export type ChangeAction = (typeof ChangeAction)[keyof typeof ChangeAction];
