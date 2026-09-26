// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Typed error handling shared by all app/api route handlers.

import { NextResponse } from "next/server";
import { SupabaseConfigError } from "@/lib/supabase/client";
import { ConflictError, NotFoundError } from "@/lib/supabase/errors";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CONFIG_ERROR"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static validation(message: string, details?: unknown): ApiError {
    return new ApiError(400, "VALIDATION_ERROR", message, details);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, "CONFLICT", message);
  }
}

export function apiErrorResponse(error: ApiError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    },
    { status: error.status },
  );
}

/**
 * Wraps a route handler body so every thrown error becomes a consistent
 * typed JSON error response instead of an unhandled 500 with a stack trace
 * or leaking to Next's default error page.
 */
export function withApiErrorHandling(
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  return handler().catch((error: unknown) => {
    if (error instanceof ApiError) {
      return apiErrorResponse(error);
    }

    if (error instanceof SupabaseConfigError) {
      return apiErrorResponse(new ApiError(500, "CONFIG_ERROR", error.message));
    }

    if (error instanceof NotFoundError) {
      return apiErrorResponse(new ApiError(404, "NOT_FOUND", error.message));
    }

    if (error instanceof ConflictError) {
      return apiErrorResponse(new ApiError(409, "CONFLICT", error.message));
    }

    console.error("Unhandled API error:", error);
    return apiErrorResponse(
      new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred."),
    );
  });
}
