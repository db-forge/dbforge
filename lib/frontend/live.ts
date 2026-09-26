// Live backend client: talks to app/api/* (Developer 3). Only api.ts uses this.
import type { MockMission } from "@/lib/mock/missions";
import { SEED_MISSIONS } from "@/lib/mock/missions";
import type { MockSubmission } from "@/lib/mock/store";
import type {
  AiVerifyResponseDto,
  DatasetSummaryDto,
  MissionDto,
  SettlementResponseDto,
  SignedMediaDto,
  SubmissionDto,
  UploadedSubmissionDto,
  VerifyResponseDto,
} from "./dto";
import { ApiRequestError, apiFetch, errorMessage } from "./http";
import { t } from "./i18n";
import type { Company, VerifyResult } from "./types";

// ---------- missions ----------

// Same heuristic the server uses to build AI criteria (lib/verification/criteria.ts):
// every sentence of the description is one criterion.
function criteriaFrom(description: string, title: string) {
  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/[.!?]$/, ""))
    .filter((s) => s.length >= 3);
  return sentences.length > 0 ? sentences : [title];
}

function companyFor(address: string): Company {
  const tag = address.slice(2, 6).toUpperCase();
  return { name: t().errors.company(tag), handle: address.slice(2, 10).toLowerCase(), initials: tag.slice(0, 2) };
}

/**
 * The API has no company/category/cover fields yet. Missions whose title
 * matches a seed get the seed's presentation (demo); others get defaults.
 */
export function toMockMission(dto: MissionDto): MockMission {
  const key = dto.title.trim().toLocaleLowerCase("tr");
  const seed = SEED_MISSIONS.find((m) => m.title.toLocaleLowerCase("tr") === key);
  return {
    id: dto.id,
    chainMissionId: dto.chainMissionId ?? "",
    buyerAddress: dto.buyerAddress,
    title: dto.title,
    description: dto.description,
    rewardMon: Number(dto.rewardMon),
    targetCount: dto.targetCount,
    acceptedCount: dto.acceptedCount,
    status: dto.status,
    company: seed?.company ?? companyFor(dto.buyerAddress),
    category: dto.category ?? seed?.category ?? "gundelik",
    coverUrl: dto.coverUrl ?? seed?.coverUrl ?? "",
    sampleVideoUrl: seed?.sampleVideoUrl ?? "",
    createdAt: dto.createdAt,
    registeredCount: seed?.registeredCount ?? 0,
    perUserLimit: dto.perUserLimit ?? seed?.perUserLimit ?? 5,
    minDurationSec: 10,
    criteria: dto.criteria?.length ? dto.criteria : criteriaFrom(dto.description, dto.title),
  };
}

export async function fetchMissions(): Promise<MockMission[]> {
  const { missions } = await apiFetch<{ missions: MissionDto[] }>("/api/missions");
  return missions.filter((m) => m.status === "active" || m.status === "completed").map(toMockMission);
}

/** Mirrors an already-confirmed MissionCreated transaction into Supabase. */
export async function persistMission(input: {
  txHash: string;
  title: string;
  description: string;
  category: "teknoloji" | "doga" | "gundelik";
  coverUrl: string | null;
  perUserLimit: number;
  criteria: string[];
}): Promise<MockMission> {
  // The wallet helper waits for the receipt, but an RPC replica can briefly
  // lag behind. Retry only the API's explicit PENDING response.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await apiFetch<{ mission?: MissionDto; code?: string }>("/api/missions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (result.mission) return toMockMission(result.mission);
    if (result.code !== "PENDING") break;
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  throw new Error(t().errors.requestFailed);
}

/** null when the id is unknown (or not a UUID, which the API rejects with 400). */
export async function fetchMission(id: string): Promise<MockMission | null> {
  try {
    const { mission } = await apiFetch<{ mission: MissionDto }>(`/api/missions/${id}`);
    return toMockMission(mission);
  } catch (e) {
    if (e instanceof ApiRequestError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}

export async function fetchDataset(missionId: string): Promise<DatasetSummaryDto | null> {
  try {
    const { dataset } = await apiFetch<{ dataset: DatasetSummaryDto }>(`/api/missions/${missionId}/dataset`);
    return dataset;
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) return null;
    throw e;
  }
}

// ---------- submissions ----------

export async function uploadMedia(
  missionId: string,
  contributorAddress: string,
  file: File,
): Promise<UploadedSubmissionDto> {
  // MediaRecorder types look like "video/webm;codecs=vp9"; the API expects the bare MIME.
  const type = file.type.split(";")[0] || "video/mp4";
  const media = type === file.type ? file : new File([file], file.name, { type });
  const form = new FormData();
  form.append("missionId", missionId);
  form.append("contributorAddress", contributorAddress);
  form.append("media", media);
  const { submission } = await apiFetch<{ submission: UploadedSubmissionDto }>("/api/submissions/upload", {
    method: "POST",
    body: form,
  });
  return submission;
}

export async function fetchSubmission(id: string): Promise<SubmissionDto | null> {
  try {
    const { submission } = await apiFetch<{ submission: SubmissionDto }>(`/api/submissions/${id}`);
    return submission;
  } catch (e) {
    if (e instanceof ApiRequestError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}

export async function fetchMediaUrl(id: string): Promise<string | null> {
  try {
    return (await apiFetch<SignedMediaDto>(`/api/submissions/${id}/media`)).url;
  } catch {
    return null;
  }
}

export function resultFromStatus(status: SubmissionDto["status"]): VerifyResult | null {
  if (status === "paid" || status === "accepted") return "accepted";
  if (status === "rejected") return "rejected";
  if (status === "manual_review") return "review";
  return null;
}

type Patch = Partial<Pick<MockSubmission, "result" | "aiScore" | "txHash" | "rejectReason" | "note">>;

/**
 * Drives one submission through the backend pipeline:
 * deterministic checks → AI (vision) check → on-chain settlement.
 * Each step reports into `update` so the UI (polling the local record) follows along.
 */
export async function runPipeline(id: string, contributorAddress: string, update: (patch: Patch) => void) {
  try {
    const verify = await apiFetch<VerifyResponseDto>(`/api/verify/${id}`, { method: "POST" });
    if (!verify.technicalValid) {
      const failed = verify.checks.find((c) => !c.passed && c.severity === "hard_fail");
      update({
        result: "rejected",
        aiScore: verify.technicalScore,
        rejectReason: errorMessage(verify.failureCode, failed?.reason ?? t().errors.technicalFail),
      });
      return;
    }

    const ai = await apiFetch<AiVerifyResponseDto>(`/api/verify/${id}/ai`, { method: "POST" });
    if (ai.decision === "rejected") {
      const failed = ai.criteria.find((c) => !c.passed);
      update({
        result: "rejected",
        aiScore: ai.semanticScore,
        rejectReason: failed?.evidence ?? t().errors.criteriaNotMet,
      });
      return;
    }
    if (ai.decision === "manual_review") {
      update({ result: "review", aiScore: ai.semanticScore });
      return;
    }

    update({ aiScore: ai.semanticScore });
    try {
      const paid = await apiFetch<SettlementResponseDto>(`/api/settlement/${id}`, { method: "POST" });
      update({ result: "accepted", txHash: paid.settlement.txHash });
      try {
        const withdrawal = await apiFetch<{ txHash?: string; status: "withdrawn" | "nothing_to_withdraw" }>(
          `/api/contributors/${encodeURIComponent(contributorAddress)}/withdraw`,
          { method: "POST" },
        );
        if (withdrawal.status === "withdrawn" && withdrawal.txHash) {
          // This transaction actually moves the credited MON into the wallet.
          update({ txHash: withdrawal.txHash });
        }
      } catch (error) {
        // The reward remains safely credited in the Vault for a later retry.
        update({ note: t().errors.payoutQueued((error as Error).message) });
      }
    } catch (e) {
      // Accepted, but the payout could not be sent yet (e.g. contract not deployed).
      update({ result: "accepted", txHash: "", note: t().errors.payoutQueued((e as Error).message) });
    }
  } catch (e) {
    update({ result: "review", note: (e as Error).message });
  }
}
