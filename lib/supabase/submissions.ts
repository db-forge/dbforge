// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Data access for the submissions table. No HTTP concerns here — route
// handlers translate results/errors into responses.

import { getSupabaseServiceClient } from "./client";
import { getMissionById } from "./missions";
import { ConflictError, NotFoundError } from "./errors";
import type { SubmissionRow } from "./types";

export interface CreateSubmissionInput {
  missionId: string;
  contributorAddress: string;
  mediaUrl: string | null;
  mediaHash: string | null;
}

export async function getSubmissionById(id: string): Promise<SubmissionRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch submission ${id}: ${error.message}`);
  }

  return (data as SubmissionRow | null) ?? null;
}

/**
 * Creates a submission against a mission. Media upload and AI verification
 * are out of scope for M0 — this only records the submission with status
 * "uploaded"; verification is a later milestone.
 */
export async function createSubmission(
  input: CreateSubmissionInput,
): Promise<SubmissionRow> {
  const mission = await getMissionById(input.missionId);

  if (!mission) {
    throw new NotFoundError(`Mission ${input.missionId} not found.`);
  }

  if (mission.status !== "active") {
    throw new ConflictError(
      `Mission ${input.missionId} is not accepting submissions (status: ${mission.status}).`,
    );
  }

  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("submissions")
    .insert({
      mission_id: input.missionId,
      contributor_address: input.contributorAddress,
      media_url: input.mediaUrl,
      media_hash: input.mediaHash,
      status: "uploaded",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create submission: ${error.message}`);
  }

  return data as SubmissionRow;
}
