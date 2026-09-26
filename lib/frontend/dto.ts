// Frontend copy of the response shapes from app/api/_lib/dto.ts (Developer 3).
// Kept here so the frontend builds without importing server-only modules.
// Keep in sync when the API contract changes.

export type ApiMissionStatus = "draft" | "active" | "completed" | "cancelled";

export type ApiSubmissionStatus =
  | "uploaded"
  | "verifying"
  | "accepted"
  | "rejected"
  | "paid"
  | "manual_review";

export interface MissionDto {
  id: string;
  chainMissionId: string | null;
  buyerAddress: string;
  title: string;
  description: string;
  rewardMon: string;
  targetCount: number;
  acceptedCount: number;
  status: ApiMissionStatus;
  createdAt: string;
}

export interface SubmissionDto {
  id: string;
  missionId: string;
  contributorAddress: string;
  mediaUrl: string | null;
  mediaPath: string | null;
  mediaType: string | null;
  sizeBytes: number | null;
  mediaHash: string | null;
  status: ApiSubmissionStatus;
  confidence: number | null;
  txHash: string | null;
  createdAt: string;
}

export interface UploadedSubmissionDto {
  id: string;
  missionId: string;
  contributorAddress: string;
  mediaPath: string;
  mediaHash: string;
  mediaType: string;
  sizeBytes: number;
  status: ApiSubmissionStatus;
  createdAt: string;
}

export interface CheckResultDto {
  id: string;
  category: "state" | "media" | "fraud" | "quality";
  passed: boolean;
  severity: "hard_fail" | "warning" | "info";
  score?: number;
  reason: string;
}

/** POST /api/verify/[submissionId] — deterministic checks. */
export interface VerifyResponseDto {
  submissionId: string;
  status: ApiSubmissionStatus;
  technicalValid: boolean;
  technicalScore: number;
  readyForAi: boolean;
  verificationVersion: string;
  checks: CheckResultDto[];
  failureCode?: string;
}

/** POST /api/verify/[submissionId]/ai — semantic (vision) check. */
export interface AiVerifyResponseDto {
  submissionId: string;
  decision: "accepted" | "rejected" | "manual_review";
  semanticScore: number;
  modelConfidence: number;
  criteria: { criterionId: string; passed: boolean; confidence: number; evidence: string }[];
}

/** POST /api/settlement/[submissionId]. */
export interface SettlementResponseDto {
  submissionId: string;
  status: "paid";
  settlement: { txHash: string; amountWei: string; blockNumber: string; chainMissionId: string };
}

/** GET /api/missions/[id]/dataset. */
export interface DatasetSummaryDto {
  version: number;
  sampleCount: number;
  merkleRoot: string;
  metadataHash: string;
  status: string;
  anchorTxHash: string | null;
}

export interface SignedMediaDto {
  url: string;
  expiresIn: number;
  mediaType: string | null;
  sizeBytes: number | null;
}
