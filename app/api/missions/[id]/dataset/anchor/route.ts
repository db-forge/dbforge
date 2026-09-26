// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// POST /api/missions/[id]/dataset/anchor — M5 Part K. Anchors the latest
// ready dataset manifest's Merkle root + metadata hash on-chain via the
// dataset anchor gateway. Never anchors a manifest that isn't 'ready', and
// once a manifest is 'anchored' it is never mutated again (a rebuild
// creates a new version instead — see the build endpoint).
//
// Integration correction: buyer approval (finalizeDataset(missionId,
// expectedRoot)) happens on-chain from the FRONTEND, with the buyer's own
// wallet — this backend never calls finalizeDataset. The frontend may
// optionally echo back the root the buyer just approved as `expectedRoot`
// in the request body; if present, it's validated against our own
// persisted root and rejected on any mismatch (e.g. the dataset was
// rebuilt with new samples between approval and this call) — the
// anchor call itself always uses OUR persisted root, never a client value.

import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import { assertUuid } from "@/app/api/_lib/validation";
import { toDatasetAnchorResponseDto } from "@/app/api/_lib/dto";
import { getMissionById } from "@/lib/supabase/missions";
import {
  getLatestDatasetManifest,
  markDatasetManifestAnchored,
  markDatasetManifestAnchorFailed,
  markDatasetManifestAnchoring,
} from "@/lib/supabase/datasetManifests";
import { getDatasetAnchorGateway } from "@/lib/verification/dataset/anchorGateway";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * The request body is entirely optional here (the original contract took
 * none at all) — only `expectedRoot` is ever read from it, purely as an
 * optional cross-check against our own persisted root, never as the value
 * that gets anchored.
 */
async function parseOptionalAnchorBody(request: Request): Promise<{ expectedRoot?: string }> {
  const text = await request.text();
  if (!text || text.trim().length === 0) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw ApiError.validation("Request body must be valid JSON when provided.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw ApiError.validation("Request body must be a JSON object when provided.");
  }

  const expectedRoot = (parsed as Record<string, unknown>).expectedRoot;
  if (expectedRoot === undefined) return {};
  if (typeof expectedRoot !== "string" || expectedRoot.trim().length === 0) {
    throw ApiError.validation("expectedRoot must be a non-empty string when provided.", {
      field: "expectedRoot",
    });
  }
  return { expectedRoot };
}

export async function POST(request: Request, { params }: RouteParams) {
  return withApiErrorHandling(async () => {
    const { id: missionId } = await params;
    assertUuid(missionId, "id");

    const { expectedRoot } = await parseOptionalAnchorBody(request);

    const mission = await getMissionById(missionId);
    if (!mission) {
      throw ApiError.missionNotFound(`Mission ${missionId} not found.`);
    }
    if (!mission.chain_mission_id) {
      throw ApiError.chainMissionNotConfigured(
        `Mission ${missionId} has no on-chain mission id recorded yet.`,
      );
    }

    const latest = await getLatestDatasetManifest(missionId);
    if (!latest) {
      throw ApiError.datasetNotReady(`No dataset manifest has been built for mission ${missionId} yet.`);
    }

    if (expectedRoot && expectedRoot.toLowerCase() !== latest.merkle_root.toLowerCase()) {
      throw ApiError.datasetRootMismatch(
        "The provided expectedRoot does not match this mission's persisted dataset root — the " +
          "dataset may have been rebuilt since it was approved. Re-approve the current root before anchoring.",
        { expectedRoot, persistedRoot: latest.merkle_root },
      );
    }

    if (latest.status === "anchored") {
      return NextResponse.json(toDatasetAnchorResponseDto(latest));
    }
    if (latest.status === "anchoring") {
      throw ApiError.datasetAnchorInProgress(
        `Dataset for mission ${missionId} is already being anchored.`,
      );
    }
    if (latest.status !== "ready" && latest.status !== "failed") {
      throw ApiError.datasetNotReady(
        `Dataset manifest status is '${latest.status}'; must be 'ready' (or a retryable 'failed') to anchor.`,
      );
    }

    const claimed = await markDatasetManifestAnchoring(latest.id);
    if (!claimed) {
      const refreshed = await getLatestDatasetManifest(missionId);
      if (refreshed?.status === "anchored") {
        return NextResponse.json(toDatasetAnchorResponseDto(refreshed));
      }
      throw ApiError.datasetAnchorInProgress(
        `Dataset for mission ${missionId} is already being anchored.`,
      );
    }

    let gatewayResult;
    try {
      const gateway = getDatasetAnchorGateway();
      gatewayResult = await gateway.anchorDataset({
        chainMissionId: mission.chain_mission_id,
        merkleRoot: claimed.merkle_root,
        sampleCount: claimed.sample_count,
        metadataHash: claimed.metadata_hash,
      });
    } catch (error) {
      await markDatasetManifestAnchorFailed(claimed.id).catch((cleanupError: unknown) => {
        console.error(`Failed to mark dataset manifest ${claimed.id} anchor-failed:`, cleanupError);
      });
      throw error;
    }

    const anchored = await markDatasetManifestAnchored(claimed.id, gatewayResult.txHash);
    if (!anchored) {
      // The gateway call already succeeded here — the anchor tx likely
      // exists on-chain but we failed to record it. Never swallow this.
      console.error(
        `CRITICAL: dataset anchor gateway succeeded for mission ${missionId} ` +
          `(txHash=${gatewayResult.txHash}) but marking the manifest anchored failed.`,
      );
      throw ApiError.databaseError(
        `Dataset anchor likely succeeded on-chain (tx ${gatewayResult.txHash}) but could not be ` +
          "recorded. Manual reconciliation required.",
      );
    }

    return NextResponse.json(toDatasetAnchorResponseDto(anchored));
  });
}
