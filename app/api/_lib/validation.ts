// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Small dependency-free validation helpers for route handlers.

import { ApiError } from "./errors";
import type { MissionStatus, SubmissionStatus } from "@/lib/supabase/types";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Monad is EVM-compatible; addresses are 20-byte hex strings.
export const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const MISSION_STATUSES: readonly MissionStatus[] = [
  "draft",
  "active",
  "completed",
  "cancelled",
];

const SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  "uploaded",
  "verifying",
  "accepted",
  "rejected",
  "paid",
];

export function assertUuid(value: string, field: string): string {
  if (!UUID_RE.test(value)) {
    throw ApiError.validation(`${field} must be a valid UUID.`, { field });
  }
  return value;
}

export function isMissionStatus(value: string): value is MissionStatus {
  return (MISSION_STATUSES as readonly string[]).includes(value);
}

export function isSubmissionStatus(value: string): value is SubmissionStatus {
  return (SUBMISSION_STATUSES as readonly string[]).includes(value);
}

export function parseMissionStatusParam(
  raw: string | null,
): MissionStatus | undefined {
  if (raw === null) return undefined;
  if (!isMissionStatus(raw)) {
    throw ApiError.validation(
      `status must be one of: ${MISSION_STATUSES.join(", ")}.`,
      { field: "status", value: raw },
    );
  }
  return raw;
}

export function parsePagination(searchParams: URLSearchParams): {
  limit: number;
  offset: number;
} {
  const DEFAULT_LIMIT = 20;
  const MAX_LIMIT = 100;

  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");

  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw ApiError.validation(
        `limit must be an integer between 1 and ${MAX_LIMIT}.`,
        { field: "limit", value: limitRaw },
      );
    }
  }

  let offset = 0;
  if (offsetRaw !== null) {
    offset = Number(offsetRaw);
    if (!Number.isInteger(offset) || offset < 0) {
      throw ApiError.validation("offset must be a non-negative integer.", {
        field: "offset",
        value: offsetRaw,
      });
    }
  }

  return { limit, offset };
}

export async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw ApiError.validation("Request body must be valid JSON.");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw ApiError.validation("Request body must be a JSON object.");
  }

  return body as Record<string, unknown>;
}

export function requireString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw ApiError.validation(`${field} is required and must be a non-empty string.`, {
      field,
    });
  }
  return value;
}

export function optionalString(
  body: Record<string, unknown>,
  field: string,
): string | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw ApiError.validation(`${field} must be a non-empty string when provided.`, {
      field,
    });
  }
  return value;
}

export function requireEvmAddress(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = requireString(body, field);
  if (!EVM_ADDRESS_RE.test(value)) {
    throw ApiError.validation(`${field} must be a valid 0x-prefixed EVM address.`, {
      field,
    });
  }
  return value;
}

export function requireFormString(form: FormData, field: string): string {
  const value = form.get(field);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw ApiError.invalidInput(
      `${field} is required and must be a non-empty string field.`,
      { field },
    );
  }
  return value;
}

// A file field parsed from multipart/form-data comes back as a File, which
// extends Blob — this covers both the Node/undici File global and any
// Blob-like implementation.
export function requireFormFile(form: FormData, field: string): Blob {
  const value = form.get(field);
  if (!(value instanceof Blob)) {
    throw ApiError.invalidInput(`${field} is required and must be a file.`, { field });
  }
  return value;
}
