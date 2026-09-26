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
  | "paid";

export type FinalDecision = "accepted" | "rejected" | "pending";

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
  media_url: string | null;
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
  duplicate_detected: boolean;
  ai_valid: boolean | null;
  ai_confidence: number | null;
  ai_reason: string | null;
  final_decision: FinalDecision;
  created_at: string;
}
