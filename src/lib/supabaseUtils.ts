export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * Logs a Supabase/Postgres error with enough context to debug it, without
 * throwing -- callers keep returning their existing fallback value
 * ([] / null / false) exactly as before.
 */
export function logSupabaseError(error: unknown, operationType: OperationType, path: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    'Supabase Error:',
    JSON.stringify({ error: message, operationType, path }),
  );
}
