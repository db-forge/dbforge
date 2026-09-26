// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Data access for the missions table. No HTTP concerns here — route
// handlers translate results/errors into responses.

import { getSupabaseServiceClient } from "./client";
import type { MissionRow, MissionStatus } from "./types";

// PostgREST (which supabase-js talks to) does NOT stringify numeric/bigint
// columns the way the raw `pg` driver does — it serializes them as plain
// JSON numbers, and JSON.parse (used internally when the client reads the
// response) silently loses precision for values with many significant
// digits (numeric) or beyond 2^53 (bigint). Casting to ::text in the
// select list is what actually guarantees a string comes back. This was
// identified but deliberately deferred during M0-M3 (see project memory);
// M4 fixes it because settlement math cannot tolerate float coercion.
const MISSION_COLUMNS =
  "id, chain_mission_id::text, buyer_address, title, description, reward_mon::text, target_count, accepted_count, status, created_at";

export interface ListMissionsParams {
  status?: MissionStatus;
  limit: number;
  offset: number;
}

export interface ListMissionsResult {
  missions: MissionRow[];
  total: number;
}

export async function listMissions(
  params: ListMissionsParams,
): Promise<ListMissionsResult> {
  const supabase = getSupabaseServiceClient();

  let query = supabase
    .from("missions")
    .select(MISSION_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

  if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list missions: ${error.message}`);
  }

  return { missions: (data ?? []) as MissionRow[], total: count ?? 0 };
}

export async function getMissionById(id: string): Promise<MissionRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("missions")
    .select(MISSION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch mission ${id}: ${error.message}`);
  }

  return (data as MissionRow | null) ?? null;
}

export async function getMissionByChainMissionId(chainMissionId: string): Promise<MissionRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("missions")
    .select(MISSION_COLUMNS)
    .eq("chain_mission_id", chainMissionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch mission by chain_mission_id ${chainMissionId}: ${error.message}`);
  }

  return (data as MissionRow | null) ?? null;
}

export interface CreateMissionFromChainEventInput {
  chainMissionId: string;
  buyerAddress: string;
  rewardMon: string;
  targetCount: number;
  title: string;
  description: string;
}

/**
 * Creates a mission row from a VERIFIED on-chain mission-creation event
 * (see lib/verification/mission/eventReader.ts) — chainMissionId,
 * buyerAddress, rewardMon (derived from the event's wei amount) and
 * targetCount all come from that verified event, never from client input.
 * Only title/description (which the chain event doesn't carry) are
 * client-supplied.
 *
 * Idempotent on chain_mission_id (unique in migration 0001): re-submitting
 * the same already-indexed txHash returns the existing row instead of
 * erroring.
 */
export async function createMissionFromChainEvent(
  input: CreateMissionFromChainEventInput,
): Promise<{ mission: MissionRow; created: boolean }> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("missions")
    .insert({
      chain_mission_id: input.chainMissionId,
      buyer_address: input.buyerAddress,
      title: input.title,
      description: input.description,
      reward_mon: input.rewardMon,
      target_count: input.targetCount,
      status: "active",
    })
    .select(MISSION_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      const existing = await getMissionByChainMissionId(input.chainMissionId);
      if (existing) {
        return { mission: existing, created: false };
      }
    }
    throw new Error(`Failed to create mission from chain event: ${error.message}`);
  }

  return { mission: data as MissionRow, created: true };
}
