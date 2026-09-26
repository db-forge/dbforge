// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Data access for the dataset_manifests table (migration 0009). An
// anchored row is never mutated again — every write here is guarded by a
// conditional WHERE clause that excludes 'anchored' rows, and a guard that
// affects zero rows throws DatasetImmutableError rather than silently
// no-op'ing, so a bug elsewhere can't quietly skip the immutability rule.

import { getSupabaseServiceClient } from "./client";
import { DatasetImmutableError } from "./errors";
import type { DatasetManifestRow } from "./types";

export async function getLatestDatasetManifest(
  missionId: string,
): Promise<DatasetManifestRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("dataset_manifests")
    .select("*")
    .eq("mission_id", missionId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch dataset manifest for mission ${missionId}: ${error.message}`);
  }

  return (data as DatasetManifestRow | null) ?? null;
}

export interface DatasetManifestContent {
  chainMissionId: string;
  sampleCount: number;
  canonicalVersion: string;
  merkleRoot: string;
  metadataHash: string;
  manifest: unknown;
}

/**
 * Creates a brand-new dataset version row (version 1, or latestVersion+1
 * when the mission already has a manifest — typically because the
 * previous one is anchored and thus immutable). The id is pre-generated
 * by the caller (not left to the DB default) because the manifest JSON
 * content itself embeds `datasetId` — chicken-and-egg otherwise.
 */
export async function insertDatasetManifest(
  id: string,
  missionId: string,
  version: number,
  content: DatasetManifestContent,
): Promise<DatasetManifestRow> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("dataset_manifests")
    .insert({
      id,
      mission_id: missionId,
      version,
      chain_mission_id: content.chainMissionId,
      sample_count: content.sampleCount,
      canonical_version: content.canonicalVersion,
      merkle_root: content.merkleRoot,
      metadata_hash: content.metadataHash,
      manifest: content.manifest,
      status: "ready",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create dataset manifest for mission ${missionId}: ${error.message}`);
  }

  return data as DatasetManifestRow;
}

/**
 * Rebuilds an existing NOT-YET-ANCHORED manifest row in place (same
 * version — this is "redo the draft," not a new version). Guarded to
 * never touch a row whose status is 'anchored'; if that guard excludes
 * the row (0 rows updated), throws DatasetImmutableError rather than
 * silently doing nothing.
 */
export async function updateDraftDatasetManifest(
  id: string,
  content: DatasetManifestContent,
): Promise<DatasetManifestRow> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("dataset_manifests")
    .update({
      sample_count: content.sampleCount,
      canonical_version: content.canonicalVersion,
      merkle_root: content.merkleRoot,
      metadata_hash: content.metadataHash,
      manifest: content.manifest,
      status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "anchored")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to rebuild dataset manifest ${id}: ${error.message}`);
  }
  if (!data) {
    throw new DatasetImmutableError(
      `Dataset manifest ${id} is anchored and cannot be modified — build a new version instead.`,
    );
  }

  return data as DatasetManifestRow;
}

/**
 * Conditional ready|failed -> anchoring. A null return means the row
 * wasn't in a claimable state (e.g. another request is already
 * anchoring, or it's already anchored) — the caller re-fetches to decide
 * which.
 */
export async function markDatasetManifestAnchoring(
  id: string,
): Promise<DatasetManifestRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("dataset_manifests")
    .update({ status: "anchoring", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["ready", "failed"])
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to claim dataset manifest ${id} for anchoring: ${error.message}`);
  }

  return (data as DatasetManifestRow | null) ?? null;
}

export async function markDatasetManifestAnchored(
  id: string,
  // null only when the chain already holds this anchor but its
  // DatasetAnchored log is outside the scanned block range.
  anchorTxHash: string | null,
): Promise<DatasetManifestRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("dataset_manifests")
    .update({
      status: "anchored",
      anchor_tx_hash: anchorTxHash,
      anchored_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "anchoring")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark dataset manifest ${id} anchored: ${error.message}`);
  }

  return (data as DatasetManifestRow | null) ?? null;
}

export async function markDatasetManifestAnchorFailed(
  id: string,
): Promise<DatasetManifestRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("dataset_manifests")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "anchoring")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark dataset manifest ${id} anchor-failed: ${error.message}`);
  }

  return (data as DatasetManifestRow | null) ?? null;
}
