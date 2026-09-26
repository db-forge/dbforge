// Frontend data access layer. UI talks ONLY to these functions.
// Right now everything is served from lib/mock; later each function can be
// swapped for a fetch() to app/api/* without touching components.
import {
  allMissions,
  DEMO_USER_ADDRESS,
  getState,
  mutate,
  subscribe,
  type MockSubmission,
} from "@/lib/mock/store";
import { COMPANIES, type MockMission } from "@/lib/mock/missions";
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
import { randomHex, seededHex, sleep } from "./utils";

const LATENCY = 250;
const VERIFY_MS = 3000;

export const onDataChange = subscribe;

/** The company the demo buyer panel acts as. */
export const CURRENT_BUYER: Company = COMPANIES.nova;

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

function findMission(id: string) {
  return allMissions().find((m) => m.id === id);
}

function resolveSubmission(sub: MockSubmission) {
  if (sub.result !== null || Date.now() < sub.verifyAt) return;
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
      target.rejectReason =
        "Nesne kadrajda net değil, hareket tamamlanmıyor";
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
    missionTitle: m?.title ?? "Görev",
    rewardMon: m?.rewardMon ?? 0,
    fileName: sub.fileName,
    previewUrl: sub.previewUrl,
    createdAt: sub.createdAt,
    aiScore: sub.aiScore,
    result: sub.result,
    rejectReason: sub.rejectReason,
  };
}

// ---------- missions ----------

export async function getMissions(filter: MissionFilter = {}): Promise<MissionPost[]> {
  await sleep(LATENCY);
  const q = filter.query?.trim().toLocaleLowerCase("tr");
  return allMissions()
    .map(toPost)
    .filter((m) => !filter.category || filter.category === "all" || m.category === filter.category)
    .filter(
      (m) =>
        !q ||
        m.title.toLocaleLowerCase("tr").includes(q) ||
        m.company.name.toLocaleLowerCase("tr").includes(q),
    )
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function getMission(id: string): Promise<MissionPost | null> {
  await sleep(LATENCY);
  const m = findMission(id);
  return m ? toPost(m) : null;
}

export async function registerMission(id: string): Promise<MissionPost> {
  await sleep(150);
  const m = findMission(id);
  if (!m) throw new Error("Görev bulunamadı");
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

export async function getTopPayers(): Promise<{ company: Company; paidMon: number; missions: number }[]> {
  await sleep(LATENCY);
  const map = new Map<string, { company: Company; paidMon: number; missions: number }>();
  for (const m of allMissions().map(toPost)) {
    const row = map.get(m.company.handle) ?? { company: m.company, paidMon: 0, missions: 0 };
    row.paidMon += m.acceptedCount * m.rewardMon;
    row.missions += 1;
    map.set(m.company.handle, row);
  }
  return [...map.values()].sort((a, b) => b.paidMon - a.paidMon);
}

// ---------- submissions ----------

export async function uploadSubmission(missionId: string, file: File): Promise<SubmissionView> {
  await sleep(600);
  const m = findMission(missionId);
  if (!m) throw new Error("Görev bulunamadı");
  const post = toPost(m);
  if (post.status === "completed") throw new Error("Bu görev tamamlandı");
  if (post.myUploads >= post.perUserLimit) throw new Error("Bu görev için yükleme limitine ulaştın");

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
  await sleep(100);
  const sub = getState().submissions.find((x) => x.id === id);
  if (!sub) return null;
  resolveSubmission(sub);
  return toSubmissionView(getState().submissions.find((x) => x.id === id)!);
}

export async function getMySubmissions(missionId?: string): Promise<SubmissionView[]> {
  await sleep(LATENCY);
  const subs = getState().submissions.filter((x) => !missionId || x.missionId === missionId);
  subs.forEach(resolveSubmission);
  return getState()
    .submissions.filter((x) => !missionId || x.missionId === missionId)
    .map(toSubmissionView);
}

export async function getMyRegistrations(): Promise<RegistrationGroups> {
  await sleep(LATENCY);
  getState().submissions.forEach(resolveSubmission);
  const posts = allMissions().map(toPost);
  const isDone = (m: MissionPost) => m.status === "completed" || m.myUploads >= m.perUserLimit;
  return {
    active: posts.filter((m) => m.isRegistered && !isDone(m)),
    saved: posts.filter((m) => m.isSaved),
    done: posts.filter((m) => m.isRegistered && isDone(m)),
  };
}

// ---------- wallet ----------

export async function getWallet(): Promise<WalletSummary> {
  await sleep(LATENCY);
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
    company: CURRENT_BUYER,
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
  await sleep(LATENCY);
  return allMissions().map(toPost);
}

export async function getBuyerMission(id: string): Promise<BuyerMissionView | null> {
  await sleep(LATENCY);
  const m = findMission(id);
  if (!m) return null;
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
