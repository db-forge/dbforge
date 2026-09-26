// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Maps DB row shapes (snake_case) to API response DTOs (camelCase).
// Numeric/bigint fields that Postgres returns as strings (to avoid
// precision loss) are kept as strings in the API response too.

import type {
  DatasetManifestRow,
  MissionRow,
  SettlementRow,
  SubmissionRow,
} from "@/lib/supabase/types";
import type { CheckResult, FailureCode, VerificationOutcome } from "@/lib/verification/types";
import type { CriterionEvidence } from "@/lib/verification/ai/types";
import type { SemanticDecision } from "@/lib/verification/decision";

export interface MissionDto {
  id: string;
  chainMissionId: string | null;
  buyerAddress: string;
  title: string;
  description: string;
  rewardMon: string;
  targetCount: number;
  acceptedCount: number;
  status: MissionRow["status"];
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
  status: SubmissionRow["status"];
  confidence: number | null;
  txHash: string | null;
  createdAt: string;
}

// Response shape for POST /api/submissions/upload — deliberately narrower
// than SubmissionDto (no confidence/txHash/mediaUrl, which don't apply to
// a just-created upload).
export interface UploadedSubmissionDto {
  id: string;
  missionId: string;
  contributorAddress: string;
  mediaPath: string;
  mediaHash: string;
  mediaType: string;
  sizeBytes: number;
  status: SubmissionRow["status"];
  createdAt: string;
}

// Response shape for POST /api/verify/[submissionId]. Flat, not wrapped in
// a `{ submission: ... }` envelope, per the M2 spec's response contract.
export interface VerifyResponseDto {
  submissionId: string;
  status: SubmissionRow["status"];
  technicalValid: boolean;
  technicalScore: number;
  readyForAi: boolean;
  verificationVersion: string;
  checks: CheckResult[];
  failureCode?: FailureCode;
}

export function toVerifyResponseDto(
  submission: SubmissionRow,
  outcome: VerificationOutcome,
): VerifyResponseDto {
  return {
    submissionId: submission.id,
    status: submission.status,
    technicalValid: outcome.technicalValid,
    technicalScore: outcome.technicalScore,
    readyForAi: outcome.readyForAi,
    verificationVersion: outcome.verificationVersion,
    checks: outcome.checks,
    ...(outcome.failureCode ? { failureCode: outcome.failureCode } : {}),
  };
}

// Response shape for POST /api/verify/[submissionId]/ai.
export interface AiVerifyResponseDto {
  submissionId: string;
  decision: SemanticDecision;
  semanticScore: number;
  modelConfidence: number;
  criteriaVersion: string;
  semanticVersion: string;
  provider: string;
  model: string;
  criteria: CriterionEvidence[];
}

// Response shape for POST /api/settlement/[submissionId].
export interface SettlementResponseDto {
  submissionId: string;
  status: "paid";
  settlement: {
    txHash: string;
    amountWei: string;
    blockNumber: string;
    chainMissionId: string;
  };
}

export function toSettlementResponseDto(
  submissionId: string,
  settlement: SettlementRow,
): SettlementResponseDto {
  return {
    submissionId,
    status: "paid",
    settlement: {
      txHash: settlement.tx_hash ?? "",
      amountWei: settlement.amount_wei,
      blockNumber: settlement.block_number ?? "",
      chainMissionId: settlement.chain_mission_id,
    },
  };
}

// Response shape for POST /api/settlement/[submissionId]/reconcile.
export interface ReconcileResponseDto {
  submissionId: string;
  status: SubmissionRow["status"];
  reconciliationStatus: SettlementRow["reconciliation_status"];
  message?: string;
  settlement?: {
    txHash: string;
    amountWei: string;
    blockNumber: string;
    chainMissionId: string;
  };
}

export function toReconcileResponseDto(
  submissionStatus: SubmissionRow["status"],
  settlement: SettlementRow,
  message?: string,
): ReconcileResponseDto {
  return {
    submissionId: settlement.submission_id,
    status: submissionStatus,
    reconciliationStatus: settlement.reconciliation_status,
    ...(message ? { message } : {}),
    ...(settlement.status === "confirmed"
      ? {
          settlement: {
            txHash: settlement.tx_hash ?? "",
            amountWei: settlement.amount_wei,
            blockNumber: settlement.block_number ?? "",
            chainMissionId: settlement.chain_mission_id,
          },
        }
      : {}),
  };
}

// Response shape for POST /api/missions/[id]/dataset.
export interface DatasetBuildResponseDto {
  datasetId: string;
  missionId: string;
  version: number;
  sampleCount: number;
  merkleRoot: string;
  metadataHash: string;
  status: DatasetManifestRow["status"];
}

export function toDatasetBuildResponseDto(row: DatasetManifestRow): DatasetBuildResponseDto {
  return {
    datasetId: row.id,
    missionId: row.mission_id,
    version: row.version,
    sampleCount: row.sample_count,
    merkleRoot: row.merkle_root,
    metadataHash: row.metadata_hash,
    status: row.status,
  };
}

// Response shape for POST /api/missions/[id]/dataset/anchor.
export interface DatasetAnchorResponseDto {
  datasetId: string;
  missionId: string;
  version: number;
  sampleCount: number;
  merkleRoot: string;
  metadataHash: string;
  status: DatasetManifestRow["status"];
  anchorTxHash: string | null;
}

export function toDatasetAnchorResponseDto(row: DatasetManifestRow): DatasetAnchorResponseDto {
  return {
    datasetId: row.id,
    missionId: row.mission_id,
    version: row.version,
    sampleCount: row.sample_count,
    merkleRoot: row.merkle_root,
    metadataHash: row.metadata_hash,
    status: row.status,
    anchorTxHash: row.anchor_tx_hash,
  };
}

// Response shape for GET /api/missions/[id]/dataset.
export interface DatasetSummaryDto {
  version: number;
  sampleCount: number;
  merkleRoot: string;
  metadataHash: string;
  status: DatasetManifestRow["status"];
  anchorTxHash: string | null;
}

export function toDatasetSummaryDto(row: DatasetManifestRow): DatasetSummaryDto {
  return {
    version: row.version,
    sampleCount: row.sample_count,
    merkleRoot: row.merkle_root,
    metadataHash: row.metadata_hash,
    status: row.status,
    anchorTxHash: row.anchor_tx_hash,
  };
}

// Response shape for GET /api/submissions/[id]/media.
export interface SignedMediaDto {
  url: string;
  expiresIn: number;
  mediaType: string | null;
  sizeBytes: number | null;
}

export function toMissionDto(row: MissionRow): MissionDto {
  return {
    id: row.id,
    chainMissionId: row.chain_mission_id,
    buyerAddress: row.buyer_address,
    title: row.title,
    description: row.description,
    rewardMon: row.reward_mon,
    targetCount: row.target_count,
    acceptedCount: row.accepted_count,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function toSubmissionDto(row: SubmissionRow): SubmissionDto {
  return {
    id: row.id,
    missionId: row.mission_id,
    contributorAddress: row.contributor_address,
    mediaUrl: row.media_url,
    mediaPath: row.media_path,
    mediaType: row.media_type,
    sizeBytes: row.size_bytes,
    mediaHash: row.media_hash,
    status: row.status,
    confidence: row.confidence,
    txHash: row.tx_hash,
    createdAt: row.created_at,
  };
}

export function toUploadedSubmissionDto(row: SubmissionRow): UploadedSubmissionDto {
  return {
    id: row.id,
    missionId: row.mission_id,
    contributorAddress: row.contributor_address,
    mediaPath: row.media_path ?? "",
    mediaHash: row.media_hash ?? "",
    mediaType: row.media_type ?? "",
    sizeBytes: row.size_bytes ?? 0,
    status: row.status,
    createdAt: row.created_at,
  };
}
