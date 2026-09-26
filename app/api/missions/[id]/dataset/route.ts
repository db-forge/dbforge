// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// POST /api/missions/[id]/dataset — builds (or rebuilds, if not yet
// anchored) a deterministic dataset manifest + Merkle root from a
// mission's eligible samples. GET returns the latest manifest's public
// summary (no private media URLs, ever).
//
// Only `id` (the mission id) comes from the client. Every field in the
// response is derived from trusted DB rows via
// lib/supabase/dataset.ts/listEligibleDatasetSamples.

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import { assertUuid } from "@/app/api/_lib/validation";
import { toDatasetBuildResponseDto, toDatasetSummaryDto } from "@/app/api/_lib/dto";
import { getMissionById } from "@/lib/supabase/missions";
import { listEligibleDatasetSamples } from "@/lib/supabase/dataset";
import {
  getLatestDatasetManifest,
  insertDatasetManifest,
  updateDraftDatasetManifest,
} from "@/lib/supabase/datasetManifests";
import { SAMPLE_CANONICAL_VERSION, canonicalizeSample } from "@/lib/verification/dataset/canonical";
import { getMerkleTreeProvider } from "@/lib/verification/dataset/merkleProvider";
import { buildDatasetManifest } from "@/lib/verification/dataset/manifest";
import { computeMetadataHash } from "@/lib/verification/dataset/metadata";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  return withApiErrorHandling(async () => {
    const { id: missionId } = await params;
    assertUuid(missionId, "id");

    const mission = await getMissionById(missionId);
    if (!mission) {
      throw ApiError.missionNotFound(`Mission ${missionId} not found.`);
    }
    if (!mission.chain_mission_id) {
      throw ApiError.chainMissionNotConfigured(
        `Mission ${missionId} has no on-chain mission id recorded yet.`,
      );
    }

    const eligibleSamples = await listEligibleDatasetSamples(missionId);
    if (eligibleSamples.length === 0) {
      throw ApiError.datasetEmpty(
        `Mission ${missionId} has no eligible samples yet (paid + accepted + settled).`,
      );
    }

    // Canonical-v1 ordering already enforced by listEligibleDatasetSamples;
    // canonicalizeSample/hashLeaf are pure maps that preserve array order,
    // so leaf order here is exactly that ordering. getMerkleTreeProvider()
    // fails closed (throws) until lib/monad/merkle.ts is wired in — see
    // lib/verification/dataset/merkleProvider.ts. Never falls back to the
    // test-only algorithm in lib/verification/dataset/merkle.ts.
    const merkleProvider = getMerkleTreeProvider();
    const canonicalSamples = eligibleSamples.map((s) => canonicalizeSample(s));
    const leafHashes = canonicalSamples.map((s) => merkleProvider.hashLeaf(s));
    const merkleRoot = merkleProvider.computeRoot(leafHashes);

    const metadataHash = computeMetadataHash({
      missionId,
      chainMissionId: mission.chain_mission_id,
      sampleCount: canonicalSamples.length,
      canonicalVersion: SAMPLE_CANONICAL_VERSION,
    });

    const latest = await getLatestDatasetManifest(missionId);

    const datasetId = latest && latest.status !== "anchored" ? latest.id : randomUUID();
    const version = latest ? (latest.status === "anchored" ? latest.version + 1 : latest.version) : 1;

    const manifest = buildDatasetManifest({
      datasetId,
      missionId,
      chainMissionId: mission.chain_mission_id,
      canonicalSamples,
    });

    const content = {
      chainMissionId: mission.chain_mission_id,
      sampleCount: canonicalSamples.length,
      canonicalVersion: SAMPLE_CANONICAL_VERSION,
      merkleRoot,
      metadataHash,
      manifest,
    };

    const row =
      latest && latest.status !== "anchored"
        ? await updateDraftDatasetManifest(latest.id, content)
        : await insertDatasetManifest(datasetId, missionId, version, content);

    return NextResponse.json(toDatasetBuildResponseDto(row));
  });
}

export async function GET(_request: Request, { params }: RouteParams) {
  return withApiErrorHandling(async () => {
    const { id: missionId } = await params;
    assertUuid(missionId, "id");

    const mission = await getMissionById(missionId);
    if (!mission) {
      throw ApiError.missionNotFound(`Mission ${missionId} not found.`);
    }

    const latest = await getLatestDatasetManifest(missionId);
    if (!latest) {
      throw ApiError.notFound(`No dataset manifest has been built for mission ${missionId} yet.`);
    }

    return NextResponse.json({ dataset: toDatasetSummaryDto(latest) });
  });
}
