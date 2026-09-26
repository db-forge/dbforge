// Frontend-only view models. They extend the shared domain types in
// lib/types.ts (read-only for us) with fields the UI needs.
import type { Mission, Submission } from "@/lib/types";

export type Category = "teknoloji" | "doga" | "gundelik";
export type CategoryFilter = Category | "all";

export const CATEGORY_LABELS: Record<Category, string> = {
  teknoloji: "Teknoloji",
  doga: "Doğa",
  gundelik: "Gündelik",
};

export interface Company {
  name: string;
  handle: string;
  initials: string;
}

export interface MissionPost extends Mission {
  company: Company;
  category: Category;
  coverUrl: string;
  sampleVideoUrl: string;
  createdAt: string;
  registeredCount: number;
  perUserLimit: number;
  minDurationSec: number;
  criteria: string[];
  // Current user's relation to the mission
  isRegistered: boolean;
  isSaved: boolean;
  myUploads: number;
  myAccepted: number;
  myReviewing: number;
  myRejected: number;
  myEarnedMon: number;
  /** Reason of the user's latest submission if it was rejected. */
  myLastRejectReason?: string;
}

export type VerifyResult = "accepted" | "rejected" | "review";

export interface SubmissionView extends Submission {
  missionTitle: string;
  rewardMon: number;
  fileName: string;
  previewUrl: string;
  createdAt: string;
  aiScore: number | null;
  result: VerifyResult | null;
  rejectReason?: string;
  note?: string;
}

export interface MissionFilter {
  category?: CategoryFilter;
  query?: string;
}

export interface RegistrationGroups {
  active: MissionPost[];
  saved: MissionPost[];
  done: MissionPost[];
}

export interface PaymentTx {
  hash: string;
  missionTitle: string;
  amountMon: number;
  createdAt: string;
}

export interface WalletSummary {
  balanceMon: number;
  earnedMon: number;
  earnedWeekMon: number;
  submitted: number;
  accepted: number;
  rejected: number;
  reviewing: number;
  payments: PaymentTx[];
}

export interface CreateMissionInput {
  title: string;
  category: Category;
  description: string;
  criteria: string[];
  rewardMon: number;
  targetCount: number;
  perUserLimit: number;
  coverUrl?: string;
  txHash?: string;
}

export interface BuyerSubmissionRow {
  id: string;
  contributorAddress: string;
  previewUrl: string;
  aiScore: number;
  status: VerifyResult;
  txHash: string | null;
  createdAt: string;
}

export interface BuyerMissionView {
  mission: MissionPost;
  spentMon: number;
  budgetMon: number;
  accepted: number;
  rejected: number;
  reviewing: number;
  avgQuality: number;
  merkleRoot: string;
  submissions: BuyerSubmissionRow[];
}
