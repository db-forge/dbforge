// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// POST /api/missions/[id]/dataset — builds (or rebuilds, if not yet
// anchored) a dataset manifest from a mission's ON-CHAIN settled samples.
//
// Integration correction: the Merkle root/sample count are no longer
// derived from our own DB query — they come from
// lib/verification/dataset/merkleProvider.ts, which rebuilds the tree
// straight from the Vault's `Settled` event logs via lib/monad. That is
// the only tree ProvenanceRegistry.verifySample can ever check proofs
// against. Our DB is only consulted afterward, to enrich the manifest
// with each sample's semanticScore for our own product's display/audit
// purposes — never to decide the root or the count.
//
// GET returns the latest manifest's public summary (no private media URLs).

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import { metadataHash as monadMetadataHash } from "@/lib/monad";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import { assertUuid } from "@/app/api/_lib/validation";
import { toDatasetBuildResponseDto, toDatasetSummaryDto } from "@/app/api/_lib/dto";
import { getMissionById } from "@/lib/supabase/missions";
import { getSupabaseServiceClient } from "@/lib/supabase/client";
import {
  getLatestDatasetManifest,
  insertDatasetManifest,
  updateDraftDatasetManifest,
} from "@/lib/supabase/datasetManifests";
import { getMerkleTreeProvider, MerkleProviderError } from "@/lib/verification/dataset/merkleProvider";
import { VERIFICATION_VERSIONS } from "@/lib/verification/dataset/manifest";
import { isMonadSettlementError } from "@/lib/monad";

const CANONICAL_VERSION = "onchain-settled-v1";

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

    const supabase = getSupabaseServiceClient();
    let tree;
    try {
      tree = await getMerkleTreeProvider().buildDatasetTree({ chainMissionId: mission.chain_mission_id });
    } catch (error) {
      if (
        error instanceof MerkleProviderError &&
        isMonadSettlementError(error.cause) &&
        error.cause.reason === "EMPTY_DATASET"
      ) {
        if (process.env.DEMO_AUTO_APPROVE_SUBMISSIONS !== "true") {
          throw ApiError.datasetEmpty(`Mission ${missionId} has no settled samples on chain yet.`);
        }

        const { data: demoSettlements, error: demoError } = await supabase
          .from("settlements")
          .select("submission_hash, contributor_address, amount_wei, tx_hash, block_number")
          .eq("mission_id", missionId)
          .eq("status", "confirmed")
          .order("submission_hash", { ascending: true });
        if (demoError) throw demoError;
        if (!demoSettlements?.length) {
          throw ApiError.datasetEmpty(`Mission ${missionId} has no settled demo samples yet.`);
        }

        const entries = demoSettlements.map((row) => ({
          submissionHash: `0x${row.submission_hash}`,
          contributor: row.contributor_address,
          amountWei: row.amount_wei,
          txHash: row.tx_hash,
          blockNumber: row.block_number ?? "0",
        }));
        tree = {
          root: keccak256(toBytes(entries.map((entry) => entry.submissionHash).join("|"))),
          sampleCount: entries.length,
          entries,
        };
        console.warn(`Demo dataset fallback used for mission ${missionId}.`);
      } else {
        throw error;
      }
    }

    // Best-effort enrichment only — never used for the root/count, and a
    // missing DB row just means semanticScore is null for that sample.
    const submissionHashes = tree.entries.map((e) => e.submissionHash.slice(2)); // strip 0x -> our bare-hex media_hash
    const { data: verifications } = await supabase
      .from("submissions")
      .select("id, media_hash, verification_results(semantic_score)")
      .in("media_hash", submissionHashes);
    const scoreByHash = new Map<string, number | null>();
    const idByHash = new Map<string, string>();
    for (const row of verifications ?? []) {
      const vr = Array.isArray(row.verification_results) ? row.verification_results[0] : row.verification_results;
      scoreByHash.set(row.media_hash as string, (vr?.semantic_score as number | null) ?? null);
      idByHash.set(row.media_hash as string, row.id as string);
    }

    const samples = tree.entries.map((e) => {
      const bareHash = e.submissionHash.slice(2);
      return {
        submissionId: idByHash.get(bareHash) ?? null,
        mediaHash: e.submissionHash,
        contributorAddress: e.contributor.toLowerCase(),
        settlementTxHash: e.txHash,
        semanticScore: scoreByHash.get(bareHash) ?? null,
      };
    });

    const latest = await getLatestDatasetManifest(missionId);
    const datasetId = latest && latest.status !== "anchored" ? latest.id : randomUUID();
    const version = latest ? (latest.status === "anchored" ? latest.version + 1 : latest.version) : 1;

    const manifest = {
      datasetId,
      missionId,
      chainMissionId: mission.chain_mission_id,
      sampleCount: tree.sampleCount,
      canonicalVersion: CANONICAL_VERSION,
      verificationVersions: VERIFICATION_VERSIONS,
      samples,
    };

    // Matches lib/monad/README.md's documented anchor flow exactly:
    // metadataHash({ missionId, root, entries }) — so Developer 2's own
    // tooling can recompute/verify the same hash independently.
    const metadataHash = monadMetadataHash({
      missionId: String(mission.chain_mission_id),
      root: tree.root,
      entries: tree.entries,
    });

    const content = {
      chainMissionId: mission.chain_mission_id,
      sampleCount: tree.sampleCount,
      canonicalVersion: CANONICAL_VERSION,
      merkleRoot: tree.root,
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
