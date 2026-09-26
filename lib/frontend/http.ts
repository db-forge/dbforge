// fetch wrapper for app/api/*. Error bodies look like
// { error: { code, message, details? } } — see app/api/_lib/errors.ts.

import { t } from "./i18n";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** `error.details` from the envelope, e.g. `{ fields }` for VALIDATION_FAILED. */
    public details?: unknown,
  ) {
    super(message);
  }
}

// User-facing text for error codes the UI can actually hit lives in the
// dictionary (errors.codes), so it follows the selected language.
export function errorMessage(code: string | undefined, fallback: string) {
  return (code && t().errors.codes[code]) || fallback;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", ...init });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", t().errors.network);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const code: string = body?.error?.code ?? `HTTP_${res.status}`;
    throw new ApiRequestError(
      res.status,
      code,
      errorMessage(code, body?.error?.message ?? t().errors.requestFailed),
      body?.error?.details ?? (body?.error?.fields ? { fields: body.error.fields } : undefined),
    );
  }
  return body as T;
}
