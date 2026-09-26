// In-memory mock backend state, persisted to localStorage so the demo survives
// reloads. Only lib/frontend/api.ts should import this.
//
// In live mode (NEXT_PUBLIC_DATA_SOURCE=live) it starts empty and only holds
// what the API cannot answer yet: registrations, saves and "my submissions".
import { IS_LIVE } from "@/lib/frontend/config";
import type { VerifyResult } from "@/lib/frontend/types";
import { seededHex } from "@/lib/frontend/utils";
import { SEED_MISSIONS, type MockMission } from "./missions";

export interface MockSubmission {
  id: string;
  missionId: string;
  contributorAddress: string;
  fileName: string;
  previewUrl: string;
  mediaHash: string;
  createdAt: string;
  verifyAt: number;
  result: VerifyResult | null;
  aiScore: number | null;
  txHash: string;
  rejectReason?: string;
  /** Extra status text, e.g. payout queued or verification service down. */
  note?: string;
  /** Created through the real API; resolved by the pipeline, not by the mock timer. */
  live?: boolean;
}

export interface MockState {
  createdMissions: MockMission[];
  registered: string[];
  saved: string[];
  submissions: MockSubmission[];
  acceptedDelta: Record<string, number>;
  registeredDelta: Record<string, number>;
  baseBalanceMon: number;
}

export const DEMO_USER_ADDRESS = "0x7a3F9c21D4e8B05a6c1E2f3d9B8A7c6D5e4F3a21";

const STORAGE_KEY = IS_LIVE ? "dbforge-live-v1" : "dbforge-mock-v1";
const past = (h: number) => Date.now() - h * 3600_000;

function seedSubmission(
  id: string,
  missionId: string,
  hoursAgo: number,
  result: VerifyResult,
): MockSubmission {
  const mission = SEED_MISSIONS.find((m) => m.id === missionId)!;
  return {
    id,
    missionId,
    contributorAddress: DEMO_USER_ADDRESS,
    fileName: `${missionId}-${id}.mp4`,
    previewUrl: mission.sampleVideoUrl,
    mediaHash: seededHex(`media-${id}`, 32),
    createdAt: new Date(past(hoursAgo)).toISOString(),
    verifyAt: past(hoursAgo),
    result,
    aiScore: result === "accepted" ? 0.94 : result === "review" ? 0.71 : 0.42,
    txHash: result === "accepted" ? seededHex(`tx-${id}`, 32) : "",
  };
}

function initialState(): MockState {
  if (IS_LIVE) {
    return {
      createdMissions: [],
      registered: [],
      saved: [],
      submissions: [],
      acceptedDelta: {},
      registeredDelta: {},
      baseBalanceMon: 0,
    };
  }
  return {
    createdMissions: [],
    registered: ["m3", "m5"],
    saved: ["m2"],
    submissions: [
      seedSubmission("s-seed-1", "m5", 40, "accepted"),
      seedSubmission("s-seed-2", "m5", 38, "accepted"),
      seedSubmission("s-seed-3", "m5", 30, "accepted"),
      seedSubmission("s-seed-4", "m3", 6, "accepted"),
      seedSubmission("s-seed-5", "m3", 4, "accepted"),
      seedSubmission("s-seed-6", "m3", 1, "review"),
    ],
    acceptedDelta: {},
    registeredDelta: {},
    baseBalanceMon: 2.5,
  };
}

let state: MockState | null = null;
const listeners = new Set<() => void>();

function load(): MockState {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as MockState;
    // Blob URLs from a previous page session are dead; fall back to sample video.
    for (const s of parsed.submissions) {
      if (s.previewUrl.startsWith("blob:")) {
        const m = [...SEED_MISSIONS, ...parsed.createdMissions].find(
          (x) => x.id === s.missionId,
        );
        s.previewUrl = m?.sampleVideoUrl ?? "/demo/bottle-drop.mp4";
      }
    }
    return parsed;
  } catch {
    return initialState();
  }
}

export function getState(): MockState {
  if (!state) state = load();
  return state;
}

export function mutate(fn: (s: MockState) => void) {
  const s = getState();
  fn(s);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // storage unavailable; keep in-memory only
    }
  }
  listeners.forEach((l) => l());
}

export function resetState() {
  state = initialState();
  mutate(() => {});
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function allMissions(): MockMission[] {
  return [...getState().createdMissions, ...SEED_MISSIONS];
}
