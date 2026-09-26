// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Row types mirror supabase/migrations/0001_init_core_schema.sql exactly.
// These are internal (snake_case, DB-shaped) — route handlers map them to
// camelCase API DTOs before returning them to clients.

export type MissionStatus = "draft" | "active" | "completed" | "cancelled";

export type SubmissionStatus =
  | "uploaded"
  | "verifying"
  | "accepted"
  | "rejected"
  | "paid"
  // M3: model result was ambiguous — needs a human decision, not a
  // deterministic pass/fail. Not a final status; see lib/verification/stateMachine.ts.
  | "manual_review";

export type FinalDecision = "accepted" | "rejected" | "pending" | "manual_review";

export interface MissionRow {
  id: string;
  // bigint columns come back from postgres as strings to avoid precision
  // loss for values beyond Number.MAX_SAFE_INTEGER.
  chain_mission_id: string | null;
  buyer_address: string;
  title: string;
  description: string;
  // numeric columns come back as strings for the same reason.
  reward_mon: string;
  target_count: number;
  accepted_count: number;
  status: MissionStatus;
  created_at: string;
}

export interface SubmissionRow {
  id: string;
  mission_id: string;
  contributor_address: string;
  // Legacy M0 field: a caller-supplied URL for the metadata-only creation
  // flow (POST /api/submissions). Not used by the M1 upload pipeline.
  media_url: string | null;
  // Private Supabase Storage object path populated by the M1 upload
  // pipeline (POST /api/submissions/upload). See lib/supabase/storage.ts.
  media_path: string | null;
  media_type: string | null;
  // Max supported size is 100 MB, well within a safe JS integer — stored
  // as a plain `integer` column (not bigint) so no precision handling is
  // needed here.
  size_bytes: number | null;
  media_hash: string | null;
  status: SubmissionStatus;
  confidence: number | null;
  tx_hash: string | null;
  created_at: string;
}

export interface VerificationResultRow {
  id: string;
  submission_id: string;
  technical_valid: boolean;
  // M2 deterministic pipeline fields — see lib/verification/.
  technical_score: number;
  checks: unknown;
  started_at: string;
  completed_at: string;
  verification_version: string;
  failure_code: string | null;
  duplicate_detected: boolean;
  // M3 AI semantic verification fields — see lib/verification/ai/.
  ai_valid: boolean | null;
  ai_confidence: number | null;
  ai_reason: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  // Full validated structured VisionVerificationResult, for audit/replay.
  ai_result: unknown;
  semantic_score: number | null;
  criteria_version: string | null;
  ai_started_at: string | null;
  ai_completed_at: string | null;
  final_decision: FinalDecision;
  created_at: string;
}

export type SettlementStatus = "pending" | "broadcasting" | "confirmed" | "failed";

export type ReconciliationStatus =
  | "none"
  | "required"
  | "confirmed_onchain"
  | "not_found_onchain"
  | "unknown";

export interface SettlementRow {
  id: string;
  submission_id: string;
  mission_id: string;
  chain_mission_id: string;
  contributor_address: string;
  submission_hash: string;
  // Money fields are `text` at the DB level too (see migration 0007) —
  // never parsed as a JS number for settlement math.
  amount_mon: string;
  amount_wei: string;
  status: SettlementStatus;
  tx_hash: string | null;
  block_number: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  settled_at: string | null;
  // M5 Part A reconciliation bookkeeping — see lib/verification/settlement/.
  reconciliation_status: ReconciliationStatus;
  last_reconciled_at: string | null;
  reconciliation_attempts: number;
  reconciliation_error: string | null;
}

export type DatasetManifestStatus = "draft" | "ready" | "anchoring" | "anchored" | "failed";

export interface DatasetManifestRow {
  id: string;
  mission_id: string;
  version: number;
  chain_mission_id: string;
  sample_count: number;
  canonical_version: string;
  merkle_root: string;
  metadata_hash: string;
  manifest: unknown;
  status: DatasetManifestStatus;
  anchor_tx_hash: string | null;
  created_at: string;
  updated_at: string;
  anchored_at: string | null;
}
