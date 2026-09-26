// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Data access for the submissions table. No HTTP concerns here — route
// handlers translate results/errors into responses.

import { getSupabaseServiceClient } from "./client";
import { getMissionById } from "./missions";
import { ConflictError, DuplicateSubmissionError, NotFoundError } from "./errors";
import type { SubmissionRow } from "./types";

const UNIQUE_VIOLATION = "23505";

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

/**
 * Fast-path duplicate check used by the upload pipeline before touching
 * storage. This is not fully race-safe on its own — the unique index on
 * (mission_id, media_hash) added in migration 0002 is the actual guard;
 * see the 23505 handling in createUploadedSubmission below.
 */
export async function findSubmissionByMissionAndHash(
  missionId: string,
  mediaHash: string,
): Promise<SubmissionRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("mission_id", missionId)
    .eq("media_hash", mediaHash)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check for duplicate submission: ${error.message}`);
  }

  return (data as SubmissionRow | null) ?? null;
}

export interface CreateUploadedSubmissionInput {
  id: string;
  missionId: string;
  contributorAddress: string;
  mediaPath: string;
  mediaHash: string;
  mediaType: string;
  sizeBytes: number;
}

/**
 * Inserts a submission created via the M1 upload pipeline. The mission's
 * existence/active status must already have been validated by the caller
 * (the route handler needs those checks before it touches storage, so
 * re-validating here would be redundant). Only the exact-duplicate race is
 * re-checked here, via the DB unique constraint.
 */
export async function createUploadedSubmission(
  input: CreateUploadedSubmissionInput,
): Promise<SubmissionRow> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("submissions")
    .insert({
      id: input.id,
      mission_id: input.missionId,
      contributor_address: input.contributorAddress,
      media_path: input.mediaPath,
      media_hash: input.mediaHash,
      media_type: input.mediaType,
      size_bytes: input.sizeBytes,
      status: "uploaded",
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new DuplicateSubmissionError(
        `A submission with this exact media already exists for mission ${input.missionId}.`,
      );
    }
    throw new Error(`Failed to create submission: ${error.message}`);
  }

  return data as SubmissionRow;
}
