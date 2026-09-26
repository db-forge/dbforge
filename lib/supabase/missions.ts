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
