// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Data access for the missions table. No HTTP concerns here — route
// handlers translate results/errors into responses.

import { getSupabaseServiceClient } from "./client";
import type { MissionRow, MissionStatus } from "./types";

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
    .select("*", { count: "exact" })
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
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch mission ${id}: ${error.message}`);
  }

  return (data as MissionRow | null) ?? null;
}
