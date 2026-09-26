// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Typed error handling shared by all app/api route handlers.

import { NextResponse } from "next/server";
import { SupabaseConfigError } from "@/lib/supabase/client";
import { StorageError } from "@/lib/supabase/storage";
import {
  ConflictError,
  DuplicateSubmissionError,
  NotFoundError,
  SubmissionFinalizedError,
} from "@/lib/supabase/errors";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CONFIG_ERROR"
  | "INTERNAL_ERROR"
  // M1 upload pipeline (POST /api/submissions/upload)
  | "INVALID_INPUT"
  | "MISSION_NOT_FOUND"
  | "MISSION_NOT_ACTIVE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "FILE_TOO_LARGE"
  | "EMPTY_FILE"
  | "DUPLICATE_SUBMISSION"
  | "STORAGE_UPLOAD_FAILED"
  | "DATABASE_ERROR"
  // M2 verification pipeline (POST /api/verify/[submissionId], GET /api/submissions/[id]/media)
  | "SUBMISSION_NOT_FOUND"
  | "SUBMISSION_FINALIZED"
  | "MEDIA_NOT_FOUND"
  | "VERIFICATION_FAILED"
  | "STORAGE_ERROR";

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

  static invalidInput(message: string, details?: unknown): ApiError {
    return new ApiError(400, "INVALID_INPUT", message, details);
  }

  static missionNotFound(message: string): ApiError {
    return new ApiError(404, "MISSION_NOT_FOUND", message);
  }

  static missionNotActive(message: string): ApiError {
    return new ApiError(409, "MISSION_NOT_ACTIVE", message);
  }

  static unsupportedMediaType(message: string, details?: unknown): ApiError {
    return new ApiError(400, "UNSUPPORTED_MEDIA_TYPE", message, details);
  }

  static fileTooLarge(message: string, details?: unknown): ApiError {
    return new ApiError(413, "FILE_TOO_LARGE", message, details);
  }

  static emptyFile(message: string): ApiError {
    return new ApiError(400, "EMPTY_FILE", message);
  }

  static duplicateSubmission(message: string): ApiError {
    return new ApiError(409, "DUPLICATE_SUBMISSION", message);
  }

  static storageUploadFailed(message: string): ApiError {
    return new ApiError(502, "STORAGE_UPLOAD_FAILED", message);
  }

  static databaseError(message: string): ApiError {
    return new ApiError(500, "DATABASE_ERROR", message);
  }

  static submissionNotFound(message: string): ApiError {
    return new ApiError(404, "SUBMISSION_NOT_FOUND", message);
  }

  static submissionFinalized(message: string): ApiError {
    return new ApiError(409, "SUBMISSION_FINALIZED", message);
  }

  static mediaNotFound(message: string): ApiError {
    return new ApiError(404, "MEDIA_NOT_FOUND", message);
  }

  static verificationFailed(message: string): ApiError {
    return new ApiError(500, "VERIFICATION_FAILED", message);
  }

  static storageError(message: string): ApiError {
    return new ApiError(502, "STORAGE_ERROR", message);
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

    if (error instanceof DuplicateSubmissionError) {
      return apiErrorResponse(new ApiError(409, "DUPLICATE_SUBMISSION", error.message));
    }

    if (error instanceof SubmissionFinalizedError) {
      return apiErrorResponse(new ApiError(409, "SUBMISSION_FINALIZED", error.message));
    }

    if (error instanceof StorageError) {
      console.error("Storage error:", error.cause ?? error);
      return apiErrorResponse(
        new ApiError(502, "STORAGE_ERROR", "A storage error occurred processing this request."),
      );
    }

    console.error("Unhandled API error:", error);
    return apiErrorResponse(
      new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred."),
    );
  });
}
