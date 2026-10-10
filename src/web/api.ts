import type { Session } from "./types";

export class ApiError extends Error {
  constructor(
    public code: string,
    public correlationId?: string,
  ) {
    super(code);
  }
}
export async function request<T>(
  path: string,
  session?: Session | null,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError("CONNECTION_ERROR");
  }
  let payload: { data?: T; error?: { code: string; correlationId?: string } };
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("CONNECTION_ERROR");
  }
  if (!response.ok || payload.error)
    throw new ApiError(
      payload.error?.code ?? "INTERNAL_ERROR",
      payload.error?.correlationId,
    );
  return (path === "/health" ? payload : payload.data) as T;
}
export const mutationKey = () => crypto.randomUUID();

export function readSaved<T>(
  key: string,
  fallback: T,
  storage: Storage = localStorage,
): T {
  try {
    return (JSON.parse(storage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}
export function save(
  key: string,
  value: unknown,
  storage: Storage = localStorage,
) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage may be disabled; current session remains usable. */
  }
}
