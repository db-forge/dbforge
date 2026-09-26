// Frontend data access layer. UI talks ONLY to these functions.
//
// Two sources behind the same functions (see ./config.ts):
// - mock (default): everything from lib/mock, works offline for demos.
// - live: missions, uploads, verification, settlement and datasets come from
//   app/api/* (./live.ts). Registrations, saves and the user's own submission
//   list stay local because the API has no endpoints for them yet.
import {
  allMissions,
  DEMO_USER_ADDRESS,
  getState,
  mutate,
  subscribe,
  type MockSubmission,
} from "@/lib/mock/store";
import { COMPANIES, type MockMission } from "@/lib/mock/missions";
import { missionTextEn } from "@/lib/mock/missions.en";
import type {
  BuyerMissionView,
  BuyerSubmissionRow,
  Company,
  CreateMissionInput,
  MissionFilter,
  MissionPost,
  RegistrationGroups,
  SubmissionView,
  VerifyResult,
  WalletSummary,
} from "./types";
import { currentSession } from "./auth";
import { IS_LIVE } from "./config";
import { currentLocale, t } from "./i18n";
import * as live from "./live";
import { randomHex, seededHex, sleep } from "./utils";

const LATENCY = 250;
const VERIFY_MS = 3000;

export const onDataChange = subscribe;

/** Feed identity for a company name: "Nova Robotics" → @novarobotics, "NR". */
export function companyFromName(name: string): Company {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const handle = name.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "") || "company";
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : name.trim().slice(0, 2)).toLocaleUpperCase("en-US");
  return { name: name.trim(), handle, initials };
}

/**
 * The company the buyer panel acts as: the signed-in company session.
 * Falls back to the demo company outside a company session (e.g. previews).
 */
export function currentBuyer(): Company {
  const s = currentSession();
  return s?.kind === "company" ? companyFromName(s.companyName) : COMPANIES.nova;
}

/** Mock: a buyer only sees its own missions. Live: the API derives the buyer from the session. */
function ownedByBuyer(m: MockMission) {
  return IS_LIVE || m.company.handle === currentBuyer().handle;
}

// ---------- helpers ----------

function toPost(m: MockMission): MissionPost {
  const s = getState();
  const mine = s.submissions.filter((x) => x.missionId === m.id);
  const accepted = mine.filter((x) => x.result === "accepted").length;
  const reviewing = mine.filter((x) => x.result === "review" || x.result === null).length;
  const latest = mine.reduce<MockSubmission | undefined>(
    (a, b) => (!a || b.createdAt > a.createdAt ? b : a),
    undefined,
  );
  const acceptedCount = Math.min(m.targetCount, m.acceptedCount + (s.acceptedDelta[m.id] ?? 0));
  return {
    ...m,
    acceptedCount,
    status: acceptedCount >= m.targetCount ? "completed" : m.status,
    registeredCount: m.registeredCount + (s.registeredDelta[m.id] ?? 0),
    isRegistered: s.registered.includes(m.id),
    isSaved: s.saved.includes(m.id),
    myUploads: accepted + reviewing,
    myAccepted: accepted,
    myReviewing: reviewing,
    myRejected: mine.filter((x) => x.result === "rejected").length,
    myEarnedMon: accepted * m.rewardMon,
    myLastRejectReason: latest?.result === "rejected" ? latest.rejectReason : undefined,
  };
}

// Live missions fetched from GET /api/missions, cached for synchronous lookups.
let liveMissions: MockMission[] = [];
let liveLoaded = false;

/** Seed missions carry Turkish copy; swap in the English text when needed. */
function localize(m: MockMission): MockMission {
  const en = currentLocale() === "en" ? missionTextEn(m.id) : undefined;
  return en ? { ...m, ...en } : m;
}

function missionPool(): MockMission[] {
  return (IS_LIVE ? [...getState().createdMissions, ...liveMissions] : allMissions()).map(localize);
}

/** Mock: fake latency. Live: (re)load missions from the API. */
async function loadMissions(fresh = true) {
  if (!IS_LIVE) return sleep(LATENCY);
  if (fresh || !liveLoaded) {
    liveMissions = await live.fetchMissions();
    liveLoaded = true;
  }
}

function findMission(id: string) {
  return missionPool().find((m) => m.id === id);
}

function resolveSubmission(sub: MockSubmission) {
  // Live submissions are resolved by live.runPipeline, not by this timer.
  if (sub.live || sub.result !== null || Date.now() < sub.verifyAt) return;
  const name = sub.fileName.toLowerCase();
  let result: VerifyResult = "accepted";
  if (name.includes("fail")) result = "rejected";
  else if (name.includes("review")) result = "review";

  mutate((s) => {
    const target = s.submissions.find((x) => x.id === sub.id)!;
    target.result = result;
    if (result === "accepted") {
      target.aiScore = 0.88 + Math.random() * 0.1;
      target.txHash = randomHex(32);
      s.acceptedDelta[sub.missionId] = (s.acceptedDelta[sub.missionId] ?? 0) + 1;
    } else if (result === "review") {
      target.aiScore = 0.68 + Math.random() * 0.08;
    } else {
      target.aiScore = 0.3 + Math.random() * 0.2;
      target.rejectReason = t().errors.mockReject;
    }
  });
}

function toSubmissionView(sub: MockSubmission): SubmissionView {
  const m = findMission(sub.missionId);
  const status =
    sub.result === null
      ? "verifying"
      : sub.result === "accepted"
        ? "paid"
        : sub.result === "rejected"
          ? "rejected"
          : "verifying";
  return {
    id: sub.id,
    missionId: sub.missionId,
    contributorAddress: sub.contributorAddress,
    mediaUrl: sub.previewUrl,
    mediaHash: sub.mediaHash,
    status,
    confidence: sub.aiScore ?? 0,
    txHash: sub.txHash,
    missionTitle: m?.title ?? t().common.mission,
    rewardMon: m?.rewardMon ?? 0,
    fileName: sub.fileName,
    previewUrl: sub.previewUrl,
    createdAt: sub.createdAt,
    aiScore: sub.aiScore,
    result: sub.result,
    rejectReason: sub.rejectReason,
    note: sub.note,
  };
}

// ---------- missions ----------

export async function getMissions(filter: MissionFilter = {}): Promise<MissionPost[]> {
  await loadMissions();
  const q = filter.query?.trim().toLocaleLowerCase(currentLocale());
  return missionPool()
    .map(toPost)
    .filter((m) => !filter.category || filter.category === "all" || m.category === filter.category)
    .filter(
      (m) =>
        !q ||
        m.title.toLocaleLowerCase(currentLocale()).includes(q) ||
        m.company.name.toLocaleLowerCase(currentLocale()).includes(q),
    )
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function getMission(id: string): Promise<MissionPost | null> {
  if (!IS_LIVE) await sleep(LATENCY);
  else if (!getState().createdMissions.some((m) => m.id === id)) {
    const fresh = await live.fetchMission(id);
    liveMissions = [...liveMissions.filter((m) => m.id !== id), ...(fresh ? [fresh] : [])];
  }
  const m = findMission(id);
  return m ? toPost(m) : null;
}

async function ensureMission(id: string) {
  return findMission(id) ?? (IS_LIVE ? ((await getMission(id)) ?? undefined) : undefined);
}

export async function registerMission(id: string): Promise<MissionPost> {
  if (!IS_LIVE) await sleep(150);
  const m = await ensureMission(id);
  if (!m) throw new Error(t().common.missionNotFound);
  mutate((s) => {
    if (s.registered.includes(id)) return;
    s.registered.push(id);
    s.registeredDelta[id] = (s.registeredDelta[id] ?? 0) + 1;
  });
  return toPost(m);
}

export async function toggleSave(id: string): Promise<boolean> {
  let saved = false;
  mutate((s) => {
    saved = !s.saved.includes(id);
    s.saved = saved ? [...s.saved, id] : s.saved.filter((x) => x !== id);
  });
  return saved;
}

// ---------- submissions ----------

/**
 * Uploads a video for a mission. In live mode the contributor's wallet address
 * is required (payouts go there); the verification pipeline then runs in the
 * background and the submission page follows it via getSubmission.
 */
export async function uploadSubmission(
  missionId: string,
  file: File,
  contributorAddress?: string,
): Promise<SubmissionView> {
  if (!IS_LIVE) await sleep(600);
  const m = await ensureMission(missionId);
  if (!m) throw new Error(t().common.missionNotFound);
  const post = toPost(m);
  if (post.status === "completed") throw new Error(t().errors.missionCompleted);
  if (post.myUploads >= post.perUserLimit) throw new Error(t().errors.uploadLimit);

  if (IS_LIVE) {
    if (!contributorAddress) throw new Error(t().errors.connectFirst);
    const uploaded = await live.uploadMedia(missionId, contributorAddress, file);
    const sub: MockSubmission = {
      id: uploaded.id,
      missionId,
      contributorAddress,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      mediaHash: uploaded.mediaHash,
      createdAt: uploaded.createdAt,
      verifyAt: 0,
      result: null,
      aiScore: null,
      txHash: "",
      live: true,
    };
    mutate((s) => {
      if (!s.registered.includes(missionId)) s.registered.push(missionId);
      s.submissions.unshift(sub);
    });
    void live.runPipeline(sub.id, (patch) =>
      mutate((s) => {
        const target = s.submissions.find((x) => x.id === sub.id);
        if (target) Object.assign(target, patch);
      }),
    );
    return toSubmissionView(sub);
  }

  const sub: MockSubmission = {
    id: `s-${Date.now().toString(36)}`,
    missionId,
    contributorAddress: DEMO_USER_ADDRESS,
    fileName: file.name,
    previewUrl: URL.createObjectURL(file),
    mediaHash: randomHex(32),
    createdAt: new Date().toISOString(),
    verifyAt: Date.now() + VERIFY_MS,
    result: null,
    aiScore: null,
    txHash: "",
  };
  mutate((s) => {
    if (!s.registered.includes(missionId)) {
      s.registered.push(missionId);
      s.registeredDelta[missionId] = (s.registeredDelta[missionId] ?? 0) + 1;
    }
    s.submissions.unshift(sub);
  });
  return toSubmissionView(sub);
}

export async function getSubmission(id: string): Promise<SubmissionView | null> {
  if (!IS_LIVE) await sleep(100);
  const sub = getState().submissions.find((x) => x.id === id);
  if (!sub) return IS_LIVE ? getRemoteSubmission(id) : null;
  resolveSubmission(sub);
  return toSubmissionView(getState().submissions.find((x) => x.id === id)!);
}

/** A submission that isn't in this browser's list (e.g. opened from a link). */
async function getRemoteSubmission(id: string): Promise<SubmissionView | null> {
  const dto = await live.fetchSubmission(id);
  if (!dto) return null;
  await ensureMission(dto.missionId);
  const previewUrl = (await live.fetchMediaUrl(id)) ?? dto.mediaUrl ?? "";
  return toSubmissionView({
    id: dto.id,
    missionId: dto.missionId,
    contributorAddress: dto.contributorAddress,
    fileName: dto.mediaPath?.split("/").pop() ?? "video",
    previewUrl,
    mediaHash: dto.mediaHash ?? "",
    createdAt: dto.createdAt,
    verifyAt: 0,
    result: live.resultFromStatus(dto.status),
    aiScore: dto.confidence,
    txHash: dto.txHash ?? "",
    live: true,
  });
}

export async function getMySubmissions(missionId?: string): Promise<SubmissionView[]> {
  await loadMissions(false);
  const subs = getState().submissions.filter((x) => !missionId || x.missionId === missionId);
  subs.forEach(resolveSubmission);
  return getState()
    .submissions.filter((x) => !missionId || x.missionId === missionId)
    .map(toSubmissionView);
}

export async function getMyRegistrations(): Promise<RegistrationGroups> {
  await loadMissions(false);
  getState().submissions.forEach(resolveSubmission);
  const posts = missionPool().map(toPost);
  const isDone = (m: MissionPost) => m.status === "completed" || m.myUploads >= m.perUserLimit;
  return {
    active: posts.filter((m) => m.isRegistered && !isDone(m)),
    saved: posts.filter((m) => m.isSaved),
    done: posts.filter((m) => m.isRegistered && isDone(m)),
  };
}

// ---------- wallet ----------

export async function getWallet(): Promise<WalletSummary> {
  await loadMissions(false);
  const s = getState();
  s.submissions.forEach(resolveSubmission);
  const subs = getState().submissions.map(toSubmissionView);
  const accepted = subs.filter((x) => x.result === "accepted");
  const earnedMon = accepted.reduce((sum, x) => sum + x.rewardMon, 0);
  const weekAgo = Date.now() - 7 * 24 * 3600_000;
  const earnedWeekMon = accepted
    .filter((x) => +new Date(x.createdAt) >= weekAgo)
    .reduce((sum, x) => sum + x.rewardMon, 0);
  return {
    balanceMon: s.baseBalanceMon + earnedMon,
    earnedMon,
    earnedWeekMon,
    submitted: subs.length,
    accepted: accepted.length,
    rejected: subs.filter((x) => x.result === "rejected").length,
    reviewing: subs.filter((x) => x.result === "review" || x.result === null).length,
    payments: accepted
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .map((x) => ({
        hash: x.txHash,
        missionTitle: x.missionTitle,
        amountMon: x.rewardMon,
        createdAt: x.createdAt,
      })),
  };
}

// ---------- buyer ----------

export async function createMission(data: CreateMissionInput): Promise<MissionPost> {
  if (IS_LIVE) {
    if (!data.txHash) throw new Error(t().errors.requestFailed);
    const mission = await live.persistMission({
      txHash: data.txHash,
      title: data.title,
      description: data.description,
      category: data.category,
      coverUrl: data.coverUrl ?? null,
      perUserLimit: data.perUserLimit,
      criteria: data.criteria,
    });
    liveMissions = [mission, ...liveMissions.filter((item) => item.id !== mission.id)];
    liveLoaded = true;
    mutate((state) => {
      state.createdMissions = state.createdMissions.filter((item) => item.id !== mission.id);
    });
    return toPost(mission);
  }
  await sleep(LATENCY);
  const id = `m-${Date.now().toString(36)}`;
  const mission: MockMission = {
    id,
    chainMissionId: String(100 + getState().createdMissions.length),
    buyerAddress: DEMO_USER_ADDRESS,
    title: data.title,
    description: data.description,
    rewardMon: data.rewardMon,
    targetCount: data.targetCount,
    acceptedCount: 0,
    status: "active",
    company: currentBuyer(),
    category: data.category,
    coverUrl: data.coverUrl || "/missions/bottle-drop.jpg",
    sampleVideoUrl: "/demo/bottle-drop.mp4",
    createdAt: new Date().toISOString(),
    registeredCount: 0,
    perUserLimit: data.perUserLimit,
    minDurationSec: 10,
    criteria: data.criteria,
  };
  mutate((s) => {
    s.createdMissions.unshift(mission);
  });
  return toPost(mission);
}

export async function getBuyerMissions(): Promise<MissionPost[]> {
  await loadMissions();
  return missionPool().filter(ownedByBuyer).map(toPost);
}

export async function getBuyerMission(id: string): Promise<BuyerMissionView | null> {
  const m = IS_LIVE ? await ensureMission(id) : (await sleep(LATENCY), findMission(id));
  if (!m || !ownedByBuyer(m)) return null;
  getState().submissions.forEach(resolveSubmission);
  const post = toPost(m);
  const complete = post.acceptedCount >= post.targetCount;

  const mine: BuyerSubmissionRow[] = getState()
    .submissions.filter((x) => x.missionId === id && x.result !== null)
    .map((x) => ({
      id: x.id,
      contributorAddress: x.contributorAddress,
      previewUrl: m.coverUrl,
      aiScore: x.aiScore ?? 0,
      status: x.result!,
      txHash: x.txHash || null,
      createdAt: x.createdAt,
    }));

  if (IS_LIVE) {
    // No list endpoint yet (GET /api/submissions is 501): show only the
    // submissions this browser knows about, plus the real dataset summary.
    const dataset = await live.fetchDataset(id).catch(() => null);
    const scored = mine.filter((x) => x.aiScore > 0);
    return {
      mission: post,
      spentMon: post.acceptedCount * post.rewardMon,
      budgetMon: post.targetCount * post.rewardMon,
      accepted: post.acceptedCount,
      rejected: mine.filter((x) => x.status === "rejected").length,
      reviewing: mine.filter((x) => x.status === "review").length,
      avgQuality: scored.length ? scored.reduce((n, x) => n + x.aiScore, 0) / scored.length : 0,
      merkleRoot: dataset?.merkleRoot ?? "",
      submissions: mine,
    };
  }

  const seededCount = Math.min(12, post.acceptedCount);
  const seeded: BuyerSubmissionRow[] = Array.from({ length: seededCount }, (_, i) => {
    const seed = `${id}-row-${i}`;
    const roll = parseInt(seededHex(seed, 1).slice(2), 16);
    const status: VerifyResult =
      complete || roll > 60 ? "accepted" : roll > 25 ? "rejected" : "review";
    const score =
      status === "accepted" ? 0.86 + (roll % 13) / 100 : status === "review" ? 0.7 : 0.35 + (roll % 20) / 100;
    return {
      id: seed,
      contributorAddress: seededHex(`addr-${seed}`, 20),
      previewUrl: m.coverUrl,
      aiScore: score,
      status,
      txHash: status === "accepted" ? seededHex(`tx-${seed}`, 32) : null,
      createdAt: new Date(Date.now() - (i + 1) * 17 * 60000).toISOString(),
    };
  });

  const rejected = Math.round(post.acceptedCount * 0.14);
  return {
    mission: post,
    spentMon: post.acceptedCount * post.rewardMon,
    budgetMon: post.targetCount * post.rewardMon,
    accepted: post.acceptedCount,
    rejected,
    reviewing: complete ? 0 : 3,
    avgQuality: post.acceptedCount ? 0.91 : 0,
    merkleRoot: seededHex(`merkle-${id}-${post.acceptedCount}`, 32),
    submissions: [...mine, ...seeded],
  };
}
