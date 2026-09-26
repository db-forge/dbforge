// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Typed error handling shared by all app/api route handlers.

import { NextResponse } from "next/server";
import { SupabaseConfigError } from "@/lib/supabase/client";
import { StorageError } from "@/lib/supabase/storage";
import {
  ConflictError,
  DatasetImmutableError,
  DeterministicVerificationRequiredError,
  DuplicateSubmissionError,
  NotFoundError,
  SettlementInconsistentStateError,
  SubmissionFinalizedError,
  SubmissionNotAcceptedError,
} from "@/lib/supabase/errors";
import { VisionProviderError } from "@/lib/verification/ai/types";
import { FfmpegUnavailableError, FrameExtractionError } from "@/lib/verification/video";
import { SettlementGatewayError } from "@/lib/verification/settlement/types";
import { SettlementStatusGatewayError } from "@/lib/verification/settlement/statusGateway";
import { DatasetAnchorGatewayError } from "@/lib/verification/dataset/anchorGateway";

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
  | "STORAGE_ERROR"
  // M3 AI semantic verification (POST /api/verify/[submissionId]/ai)
  | "DETERMINISTIC_VERIFICATION_REQUIRED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_RESULT_INVALID"
  | "FRAME_EXTRACTION_UNAVAILABLE"
  // M4 settlement (POST /api/settlement/[submissionId])
  | "SETTLEMENT_NOT_ALLOWED"
  | "SETTLEMENT_ALREADY_IN_PROGRESS"
  | "SETTLEMENT_GATEWAY_UNAVAILABLE"
  | "SETTLEMENT_FAILED"
  | "CHAIN_MISSION_NOT_CONFIGURED"
  | "INVALID_REWARD_AMOUNT"
  | "SUBMISSION_NOT_ACCEPTED"
  | "SETTLEMENT_INCONSISTENT_STATE"
  // M5 Part A settlement reconciliation (POST /api/settlement/[submissionId]/reconcile)
  | "RECONCILIATION_GATEWAY_UNAVAILABLE"
  | "RECONCILIATION_NOT_REQUIRED"
  | "SETTLEMENT_STATE_AMBIGUOUS"
  // M5 Parts J/K/O dataset manifest + anchor (POST/GET /api/missions/[id]/dataset[/anchor])
  | "DATASET_NOT_READY"
  | "DATASET_EMPTY"
  | "DATASET_ALREADY_ANCHORED"
  | "DATASET_ANCHOR_IN_PROGRESS"
  | "DATASET_ANCHOR_GATEWAY_UNAVAILABLE"
  | "DATASET_ANCHOR_FAILED"
  | "DATASET_IMMUTABLE";

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

  static deterministicVerificationRequired(message: string): ApiError {
    return new ApiError(409, "DETERMINISTIC_VERIFICATION_REQUIRED", message);
  }

  static aiProviderUnavailable(message: string): ApiError {
    return new ApiError(503, "AI_PROVIDER_UNAVAILABLE", message);
  }

  static aiResultInvalid(message: string): ApiError {
    return new ApiError(502, "AI_RESULT_INVALID", message);
  }

  static frameExtractionUnavailable(message: string): ApiError {
    return new ApiError(503, "FRAME_EXTRACTION_UNAVAILABLE", message);
  }

  static settlementNotAllowed(message: string): ApiError {
    return new ApiError(409, "SETTLEMENT_NOT_ALLOWED", message);
  }

  static settlementAlreadyInProgress(message: string): ApiError {
    return new ApiError(409, "SETTLEMENT_ALREADY_IN_PROGRESS", message);
  }

  static settlementGatewayUnavailable(message: string): ApiError {
    return new ApiError(503, "SETTLEMENT_GATEWAY_UNAVAILABLE", message);
  }

  static settlementFailed(message: string): ApiError {
    return new ApiError(502, "SETTLEMENT_FAILED", message);
  }

  static chainMissionNotConfigured(message: string): ApiError {
    return new ApiError(409, "CHAIN_MISSION_NOT_CONFIGURED", message);
  }

  static invalidRewardAmount(message: string): ApiError {
    return new ApiError(409, "INVALID_REWARD_AMOUNT", message);
  }

  static submissionNotAccepted(message: string): ApiError {
    return new ApiError(409, "SUBMISSION_NOT_ACCEPTED", message);
  }

  static settlementInconsistentState(message: string, status = 409): ApiError {
    return new ApiError(status, "SETTLEMENT_INCONSISTENT_STATE", message);
  }

  static reconciliationGatewayUnavailable(message: string): ApiError {
    return new ApiError(503, "RECONCILIATION_GATEWAY_UNAVAILABLE", message);
  }

  static reconciliationNotRequired(message: string): ApiError {
    return new ApiError(409, "RECONCILIATION_NOT_REQUIRED", message);
  }

  static settlementStateAmbiguous(message: string): ApiError {
    return new ApiError(409, "SETTLEMENT_STATE_AMBIGUOUS", message);
  }

  static datasetNotReady(message: string): ApiError {
    return new ApiError(409, "DATASET_NOT_READY", message);
  }

  static datasetEmpty(message: string): ApiError {
    return new ApiError(409, "DATASET_EMPTY", message);
  }

  static datasetAlreadyAnchored(message: string): ApiError {
    return new ApiError(409, "DATASET_ALREADY_ANCHORED", message);
  }

  static datasetAnchorInProgress(message: string): ApiError {
    return new ApiError(409, "DATASET_ANCHOR_IN_PROGRESS", message);
  }

  static datasetAnchorGatewayUnavailable(message: string): ApiError {
    return new ApiError(503, "DATASET_ANCHOR_GATEWAY_UNAVAILABLE", message);
  }

  static datasetAnchorFailed(message: string): ApiError {
    return new ApiError(502, "DATASET_ANCHOR_FAILED", message);
  }

  static datasetImmutable(message: string): ApiError {
    return new ApiError(409, "DATASET_IMMUTABLE", message);
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

    if (error instanceof DeterministicVerificationRequiredError) {
      return apiErrorResponse(
        new ApiError(409, "DETERMINISTIC_VERIFICATION_REQUIRED", error.message),
      );
    }

    if (error instanceof SubmissionNotAcceptedError) {
      return apiErrorResponse(ApiError.submissionNotAccepted(error.message));
    }

    if (error instanceof SettlementInconsistentStateError) {
      return apiErrorResponse(ApiError.settlementInconsistentState(error.message));
    }

    if (error instanceof SettlementGatewayError) {
      console.error(`Settlement gateway error (${error.kind}):`, error.cause ?? error);
      if (error.kind === "unavailable") {
        return apiErrorResponse(
          ApiError.settlementGatewayUnavailable(
            "The settlement gateway is not currently available. No payment was attempted.",
          ),
        );
      }
      return apiErrorResponse(
        ApiError.settlementFailed(
          "The settlement gateway reported a failure. No payment was completed.",
        ),
      );
    }

    if (error instanceof DatasetImmutableError) {
      return apiErrorResponse(ApiError.datasetImmutable(error.message));
    }

    if (error instanceof SettlementStatusGatewayError) {
      console.error(`Settlement status gateway error (${error.kind}):`, error.cause ?? error);
      return apiErrorResponse(
        ApiError.reconciliationGatewayUnavailable(
          "The chain settlement-status gateway is not currently available.",
        ),
      );
    }

    if (error instanceof DatasetAnchorGatewayError) {
      console.error(`Dataset anchor gateway error (${error.kind}):`, error.cause ?? error);
      if (error.kind === "unavailable") {
        return apiErrorResponse(
          ApiError.datasetAnchorGatewayUnavailable(
            "The dataset anchor gateway is not currently available. No anchor transaction was attempted.",
          ),
        );
      }
      return apiErrorResponse(
        ApiError.datasetAnchorFailed(
          "The dataset anchor gateway reported a failure. No anchor transaction was completed.",
        ),
      );
    }

    if (error instanceof StorageError) {
      console.error("Storage error:", error.cause ?? error);
      return apiErrorResponse(
        new ApiError(502, "STORAGE_ERROR", "A storage error occurred processing this request."),
      );
    }

    if (error instanceof VisionProviderError) {
      console.error(`Vision provider error (${error.kind}):`, error.cause ?? error);
      if (error.kind === "invalid_response") {
        return apiErrorResponse(
          ApiError.aiResultInvalid("The vision provider returned an invalid or malformed result."),
        );
      }
      return apiErrorResponse(
        ApiError.aiProviderUnavailable(
          "The vision provider is currently unavailable. The submission remains in its current state and this can be retried.",
        ),
      );
    }

    if (error instanceof FfmpegUnavailableError || error instanceof FrameExtractionError) {
      console.error("Frame extraction error:", error.cause ?? error);
      return apiErrorResponse(
        ApiError.frameExtractionUnavailable(
          "Video frame extraction is unavailable on this runtime. The submission remains in its current state and this can be retried.",
        ),
      );
    }

    console.error("Unhandled API error:", error);
    return apiErrorResponse(
      new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred."),
    );
  });
}
