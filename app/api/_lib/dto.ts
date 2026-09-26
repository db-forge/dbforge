// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Maps DB row shapes (snake_case) to API response DTOs (camelCase).
// Numeric/bigint fields that Postgres returns as strings (to avoid
// precision loss) are kept as strings in the API response too.

import type { MissionRow, SubmissionRow } from "@/lib/supabase/types";

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
  mediaHash: string | null;
  status: SubmissionRow["status"];
  confidence: number | null;
  txHash: string | null;
  createdAt: string;
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
    mediaHash: row.media_hash,
    status: row.status,
    confidence: row.confidence,
    txHash: row.tx_hash,
    createdAt: row.created_at,
  };
}
